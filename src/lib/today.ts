import 'server-only'
import type { CalendarEvent, Garment, Outfit, Profile, RenderMode, Weather } from '@/lib/domain/types'
import { localDate } from '@/lib/domain/dates'
import type { Repo } from '@/lib/db/repo'
import { CalendarAuthError, fetchCalendarEvents } from '@/lib/integrations/calendar'
import { fetchWeather, MANUAL_WEATHER } from '@/lib/integrations/weather'
import { getModels } from '@/lib/models'
import { profileFor } from '@/lib/profile'
import { persistRender } from '@/lib/render'
import type { DayContext } from '@/lib/rules/types'
import { buildDayContext } from '@/lib/stylist/dayContext'
import { planOutfit } from '@/lib/stylist/loop'
import { pollResult, pollsEnabled } from '@/lib/polls'
import { dailyRules } from '@/lib/rules/registry'
import { pollWinner } from '@/lib/rules/pollWinner'
import { styleMatch } from '@/lib/rules/styleMatch'
import type { PlanOutfitResult } from '@/lib/stylist/loop'
import type { SessionUser } from '@/lib/session'

export type ManualWeather = keyof typeof MANUAL_WEATHER

/** e2e: WEATHER=fixture gives a deterministic rainy day with no network call. */
const FIXTURE_WEATHER: Weather = { tempHighC: 14, tempLowC: 9, rainProbability: 80, windKph: 18, summary: 'Rain from 17:00' }

export interface TodayPlan {
  day: DayContext
  calendarConnected: boolean
  result: { ok: true; bestEffort: boolean; outfit: Outfit; pieces: Garment[]; lookNumber: number; worn: boolean } | Extract<PlanOutfitResult, { ok: false }>
}

export async function weatherFor(profile: Profile, date: string, manual?: ManualWeather) {
  return async (lat: number, lon: number): Promise<Weather> => {
    if (manual) return MANUAL_WEATHER[manual]
    if (process.env.WEATHER === 'fixture') return FIXTURE_WEATHER
    return fetchWeather(lat, lon, date, profile.tz)
  }
}

export async function calendarFor(user: SessionUser, date: string, tz: string): Promise<{ events: CalendarEvent[]; connected: boolean }> {
  if (!user.googleAccessToken) return { events: [], connected: false }
  try {
    return { events: await fetchCalendarEvents(user.googleAccessToken, date, tz, user.userId), connected: true }
  } catch (e) {
    if (e instanceof CalendarAuthError) return { events: [], connected: false }
    console.error('calendar', e)
    return { events: [], connected: true }
  }
}

export async function dayFor(repo: Repo, user: SessionUser, date: string | null, manual?: ManualWeather) {
  const profile = await profileFor(repo, user.userId)
  const d = date ?? localDate(profile.tz)
  const [{ events, connected }, userEvents] = await Promise.all([calendarFor(user, d, profile.tz), repo.listUserEvents(user.userId, d)])
  const day = await buildDayContext({ date: d, profile, calendarEvents: events, userEvents, stylist: getModels().stylist, weatherFor: await weatherFor(profile, d, manual) })
  return { profile, day, calendarConnected: connected }
}

/** Reuses the latest outfit for the day unless `fresh`; a fresh plan avoids every look already shown that day. */
export async function planToday(repo: Repo, user: SessionUser, opts: { date?: string | null; fresh?: boolean; manual?: ManualWeather; renderMode?: RenderMode } = {}): Promise<TodayPlan> {
  const { profile, day, calendarConnected } = await dayFor(repo, user, opts.date ?? null, opts.manual)
  const shown = await repo.listOutfitsFor(user.userId, day.date)
  const wardrobe = await repo.listGarments(user.userId, { confirmed: true })
  const piecesOf = (o: Outfit) => o.garmentIds.map((id) => wardrobe.find((g) => g.id === id)).filter((g): g is Garment => !!g)

  if (!opts.fresh && shown.length) {
    const latest = shown[shown.length - 1]
    return { day, calendarConnected, result: { ok: true, bestEffort: latest.ruleReport.some((r) => !r.passed), outfit: latest, pieces: piecesOf(latest), lookNumber: shown.length, worn: await repo.hasWorn(user.userId, latest.id, day.date) } }
  }
  const poll = pollsEnabled() ? await friendsPick(repo, user.userId, day.date) : undefined
  const useStyle = process.env.NEXT_PUBLIC_FEATURE_STYLE === '1' && !!profile.styleProfile
  const rules = [...dailyRules, ...(poll ? [pollWinner] : []), ...(useStyle ? [styleMatch] : [])]
  const r = await planOutfit({ day, wardrobe, profile, models: getModels(), renderMode: opts.renderMode, avoidOutfits: shown.map((o) => o.garmentIds), poll, rules })
  if (!r.ok) return { day, calendarConnected, result: r }
  if (r.outfit.renderUrl) {
    try { r.outfit.renderUrl = await persistRender(user.userId, r.outfit.renderUrl) } catch { r.outfit.renderUrl = null; r.outfit.renderMode = 'none' }
  }
  const outfit = await repo.saveOutfit({ ...r.outfit, userId: user.userId })
  return { day, calendarConnected, result: { ok: true, bestEffort: r.bestEffort, outfit, pieces: piecesOf(outfit), lookNumber: shown.length + 1, worn: false } }
}

/** The winning look's pieces and score from the day's latest poll, if friends have picked one. */
export async function friendsPick(repo: Repo, userId: string, date: string) {
  const poll = await repo.latestPollFor(userId, date)
  if (!poll) return undefined
  const r = pollResult(poll, await repo.tally(poll.slug))
  const winner = r.winner ? await repo.getOutfit(userId, r.winner) : null
  return winner ? { outfitId: winner.id, garmentIds: winner.garmentIds, score: r.score } : undefined
}
