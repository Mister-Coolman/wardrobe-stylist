import 'server-only'
import { z } from 'zod'
import type { Repo } from '@/lib/db/repo'
import { localDate } from '@/lib/domain/dates'
import type { Models, ToolSpec } from '@/lib/models/types'
import { profileFor } from '@/lib/profile'
import { degrees, unitFor } from '@/lib/ui/temperature'
import type { SessionUser } from '@/lib/session'
import { dayFor, planToday } from '@/lib/today'
import { createTrip } from '@/lib/trips'

export interface ToolContext {
  user: SessionUser; repo: Repo; models: Models
  geocode?: (place: string) => Promise<{ lat: number; lon: number; name?: string } | null>
  /** ids the chat produced, surfaced to the UI */
  outfitId?: string; tripId?: string
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD, defaults to today')
const DEFS = {
  get_events: { description: 'Calendar and user-added events for a day', schema: z.object({ date }) },
  get_weather: { description: 'Forecast for a day at the user’s location', schema: z.object({ date }) },
  search_wardrobe: {
    description: 'Search the user’s clothes by words in the name, category or color',
    schema: z.object({ query: z.string().optional(), category: z.enum(['top', 'bottom', 'onepiece', 'outerwear', 'shoes', 'accessory']).optional() }),
  },
  plan_outfit: { description: 'Plan a fresh outfit for a day. The only way to choose clothes — never pick garments yourself.', schema: z.object({ date }) },
  plan_trip: {
    description: 'Plan outfits and a packing list for a trip',
    schema: z.object({ destination: z.string().min(1), startDate: date, endDate: date, days: z.number().int().min(1).max(21).optional() }),
  },
  log_wear: { description: 'Record that the user wore an outfit', schema: z.object({ outfitId: z.string() }) },
  add_event: { description: 'Add something to the user’s day that isn’t on their calendar, e.g. "drinks after work"', schema: z.object({ title: z.string().min(1).max(80), date }) },
} as const
type ToolName = keyof typeof DEFS

export const toolSpecs: ToolSpec[] = (Object.keys(DEFS) as ToolName[]).map((name) => ({
  name, description: DEFS[name].description, parameters: z.toJSONSchema(DEFS[name].schema) as Record<string, unknown>,
}))

async function today(ctx: ToolContext, d?: string) {
  return d ?? localDate((await profileFor(ctx.repo, ctx.user.userId)).tz)
}

/** Runs one tool call. Returns JSON-able data; errors come back as { error } so the model can recover. */
export async function dispatchTool(name: string, rawArgs: string, ctx: ToolContext): Promise<unknown> {
  if (!(name in DEFS)) return { error: `unknown tool ${name}` }
  let json: unknown
  try { json = rawArgs ? JSON.parse(rawArgs) : {} } catch { return { error: 'arguments were not valid JSON' } }
  const parsed = DEFS[name as ToolName].schema.safeParse(json)
  if (!parsed.success) return { error: `bad arguments: ${parsed.error.issues.map((i) => i.message).join('; ')}` }
  const a = parsed.data as Record<string, never>
  const { repo, user } = ctx

  switch (name as ToolName) {
    case 'get_events': {
      const { day, calendarConnected } = await dayFor(repo, user, await today(ctx, a.date))
      return { date: day.date, calendarConnected, events: day.events.map((e) => ({ title: e.title, start: e.start, source: e.source })) }
    }
    case 'get_weather': {
      const { day } = await dayFor(repo, user, await today(ctx, a.date))
      const unit = unitFor(await profileFor(repo, user.userId))
      return { date: day.date, ...day.weather, summary: `${degrees(day.weather.tempHighC, unit)}${unit} high, ${degrees(day.weather.tempLowC, unit)}${unit} low, ${day.weather.summary}` }
    }
    case 'search_wardrobe': {
      const q = (a.query as string | undefined)?.toLowerCase()
      const gs = (await repo.listGarments(user.userId, { confirmed: true }))
        .filter((g) => (!a.category || g.category === a.category) && (!q || `${g.name} ${g.category} ${g.colors.join(' ')}`.toLowerCase().includes(q)))
      return { count: gs.length, pieces: gs.slice(0, 40).map((g) => ({ id: g.id, name: g.name, category: g.category, status: g.status })),
        summary: gs.length ? `${gs.length} match: ${gs.slice(0, 5).map((g) => g.name).join(', ')}` : 'Nothing like that in the closet.' }
    }
    case 'plan_outfit': {
      const plan = await planToday(repo, user, { date: await today(ctx, a.date), fresh: true })
      if (!plan.result.ok) return { error: 'insufficient_wardrobe', missing: plan.result.missing, summary: `Can’t make an outfit yet — no clean ${plan.result.missing.join(' or ')}.` }
      ctx.outfitId = plan.result.outfit.id
      const names = plan.result.pieces.map((p) => p.name)
      return { outfitId: plan.result.outfit.id, title: plan.result.outfit.title, pieces: names,
        summary: `${plan.result.outfit.title}: ${names.join(', ')}.${plan.day.changeSuggestion ? ` ${plan.day.changeSuggestion}` : ''}` }
    }
    case 'plan_trip': {
      const trip = await createTrip(repo, user, { destination: a.destination, startDate: a.startDate, endDate: a.endDate, days: a.days }, { models: ctx.models, geocode: ctx.geocode })
      ctx.tripId = trip.id
      return { tripId: trip.id, destination: trip.destination, days: trip.dayPlans.length, pieces: trip.packingList.length, warnings: trip.warnings,
        summary: `Packed for ${trip.destination}: ${trip.dayPlans.length} days from ${trip.packingList.length} pieces.${trip.warnings.length ? ` ${trip.warnings.join(' ')}` : ''}` }
    }
    case 'log_wear': {
      const outfit = await repo.getOutfit(user.userId, a.outfitId)
      if (!outfit) return { error: 'no such outfit' }
      await repo.logWear(user.userId, outfit.id, outfit.contextDate)
      return { ok: true, summary: 'Logged.' }
    }
    case 'add_event': {
      const d = await today(ctx, a.date)
      await repo.addUserEvent({ userId: user.userId, date: d, start: null, end: null, allDay: false, title: a.title, location: null, attendees: [], source: 'user' })
      return { ok: true, date: d, summary: `Added “${a.title}”.` }
    }
  }
}
