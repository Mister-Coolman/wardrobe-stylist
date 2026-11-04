import 'server-only'
import type { Repo } from '@/lib/db/repo'
import { addDays, localDate, localTime } from '@/lib/domain/dates'
import type { CalendarEvent, Garment, Message, Profile, RuleResult, TempUnit, Weather } from '@/lib/domain/types'
import { RAIN_THRESHOLD } from '@/lib/rules/weather'
import { planToday } from '@/lib/today'
import { degrees, unitFor } from '@/lib/ui/temperature'
import { outfitCard } from './tools'

export const MIN_PIECES = 3

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** The note's one extra line. It can show on a lock screen, so an event gives its time, never its title. */
export function morningExtra(o: { weather: Weather; events: CalendarEvent[]; worn: Garment[]; ruleReport: RuleResult[]; laundry: number; unit: TempUnit }): string {
  const w = o.weather
  const wet = w.rainProbability >= RAIN_THRESHOLD
  const rainSafe = o.worn.find((g) => g.rainSafe && (g.category === 'outerwear' || g.category === 'shoes'))
  const dressy = o.events.find((e) => (e.formality ?? 0) >= 4)
  if (o.ruleReport.some((r) => r.note.includes('a coat would help')))
    return `Cold one, ${degrees(w.tempLowC, o.unit)} low, and there’s no coat in the closet. Warmest layers it is.${wet && !rainSafe ? ' Grab an umbrella.' : ''}`
  if (wet) return rainSafe ? `${w.summary} — the ${lowerFirst(rainSafe.name)} handles it.` : `${w.summary}, and nothing here is waterproof. Grab an umbrella.`
  if (dressy) return `Dressed up for ${dressy.start ? `your ${dressy.start}` : 'today'}.`
  return o.laundry > 3 ? `${o.laundry} pieces in the laundry.` : ''
}

/** When a look already saved for today was saved, as the note says it; null when it's over a week back */
export function savedWhen(at: Date, tz: string, today: string): string | null {
  const day = localDate(tz, at)
  if (day === today) return 'earlier today'
  if (day === addDays(today, -1)) return localTime(tz, at) >= '17:00' ? 'last night' : 'yesterday'
  if (day < addDays(today, -6)) return null
  return `on ${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(at)}`
}

/** The day's look, sent once a day before the owner asks: a thread message, and a WhatsApp message when linked (`send`).
 *  The cron has no Google sign-in, so only events added in the app count. Null when skipped. */
export async function morningNote(repo: Repo, profile: Profile, deps: { send?: (p: Profile, m: Message) => Promise<void> }): Promise<Message | null> {
  const userId = profile.userId
  const pieces = await repo.listGarments(userId, { confirmed: true })
  if (pieces.length < MIN_PIECES) return null
  const today = localDate(profile.tz)
  const recent = await repo.listMessages(userId, { limit: 50 })
  if (recent.some((m) => m.channel === 'system' && localDate(profile.tz, new Date(m.createdAt)) === today)) return null

  // a look the owner asked for ahead ("a fit for tmrw") is the one sent, and the note says so
  const saved = (await repo.listOutfitsFor(userId, today)).length > 0
  const plan = await planToday(repo, { userId, email: '', googleAccessToken: null }, { date: today })
  let text: string
  const cards: Message['cards'] = []
  if (!plan.result.ok) {
    text = `Morning. No clean ${plan.result.missing.join(' or ')} today — wash day?`
  } else {
    const { outfit, pieces: worn } = plan.result
    const extra = morningExtra({ weather: plan.day.weather, events: plan.day.events, worn, ruleReport: outfit.ruleReport,
      laundry: pieces.filter((g) => g.status === 'laundry').length, unit: unitFor(profile) })
    const shownAt = saved ? recent.filter((m) => m.cards.some((c) => c.kind === 'outfit' && c.outfitId === outfit.id)).map((m) => m.createdAt).sort()[0] : undefined
    const when = shownAt ? savedWhen(new Date(shownAt), profile.tz, today) : null
    const lead = saved ? `Going with the look ${when ? `you saved ${when}` : 'already saved for today'}` : 'A fresh pick for today'
    text = `Morning. ${lead}, ${outfit.title}: ${worn.map((g) => g.name).join(', ')}.${extra ? ` ${extra}` : ''}`
    cards.push(outfitCard(outfit, worn))
  }
  const m = await repo.addMessage({ userId, role: 'assistant', text, cards, imageUrl: null, channel: 'system', replyTo: null, waIds: [] })
  await deps.send?.(profile, m).catch((e) => console.error('morning send failed', e))
  return m
}
