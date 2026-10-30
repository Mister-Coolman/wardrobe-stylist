import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Repo } from '@/lib/db/repo'
import type { Card, Garment, Message, Outfit } from '@/lib/domain/types'
import type { Product } from '@/lib/shop/search'
import { localDate } from '@/lib/domain/dates'
import type { Models, ToolSpec } from '@/lib/models/types'
import { profileFor } from '@/lib/profile'
import { degrees, unitFor } from '@/lib/ui/temperature'
import type { SessionUser } from '@/lib/session'
import { dayFor, planToday } from '@/lib/today'
import { createTrip } from '@/lib/trips'
import { washPatch } from '@/lib/garments'
import { piecesFromScan } from '@/lib/scan/pipeline'
import { startListing } from '@/lib/shop/add'
import { getProductSearch } from '@/lib/shop/search'
import { getStorage } from '@/lib/storage'

export interface ToolContext {
  user: SessionUser; repo: Repo; models: Models
  geocode?: (place: string) => Promise<{ lat: number; lon: number; name?: string } | null>
  /** what the reply shows besides its text; tools push to it */
  cards: Card[]
  /** the photo this message carries (or the one it replies to) */
  imageUrl?: string
  /** listings from the newest listings card in view, for "add 2" */
  lastListings?: Product[]
  channel: Message['channel']
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD, defaults to today')
const wish = z.string().max(200).optional()
export const MAX_NOTES = 30
const DEFS = {
  get_events: { description: 'Calendar and user-added events for a day', schema: z.object({ date }) },
  get_weather: { description: 'Forecast for a day at the user’s location', schema: z.object({ date }) },
  search_wardrobe: {
    description: 'Search the user’s clothes by words in the name, category or color',
    schema: z.object({ query: z.string().optional(), category: z.enum(['top', 'bottom', 'onepiece', 'outerwear', 'shoes', 'accessory']).optional() }),
  },
  plan_outfit: {
    description: 'Plan a fresh outfit for a day. The only way to choose clothes — never pick garments yourself. wish: what the owner asked for ("fall themed", "all black").',
    schema: z.object({ date, wish }),
  },
  another_look: { description: 'A different outfit for the same day than the ones already shown', schema: z.object({ date, wish }) },
  swap_piece: {
    description: 'Replan an outfit, keeping every piece except the dropped ones. drop: piece ids from the outfit; wish: what the replacement should be ("smarter", "warmer").',
    schema: z.object({ outfitId: z.string(), drop: z.array(z.string()).min(1), wish }),
  },
  set_status: { description: 'Mark pieces clean, worn or in the laundry (e.g. "spilled coffee on it")', schema: z.object({ ids: z.array(z.string()).min(1), status: z.enum(['clean', 'worn', 'laundry']) }) },
  edit_piece: {
    description: 'Change a piece’s name, brand, fit or details (tags). Only the given fields change.',
    schema: z.object({ id: z.string(), name: z.string().min(1).max(80).optional(), brand: z.string().max(60).nullable().optional(),
      fit: z.enum(['slim', 'classic', 'relaxed', 'oversized']).nullable().optional(), tags: z.array(z.string().max(40)).max(12).optional() }),
  },
  delete_piece: { description: 'Remove a piece from the closet. Ask the owner first; pass confirm: true only after they say yes.', schema: z.object({ id: z.string(), confirm: z.boolean() }) },
  shop_search: { description: 'Search stores for a product the owner has or wants, e.g. "black Under Armour sweatpants". Shows listings they can add by number.', schema: z.object({ query: z.string().min(2).max(120) }) },
  remember: {
    description: 'Save a standing preference the owner states ("in general I like navy with olive", "I run warm", "never suggest shorts"). pieceIds: when it pairs specific pieces.',
    schema: z.object({ text: z.string().min(1).max(200), pieceIds: z.array(z.string()).max(6).optional() }),
  },
  forget: { description: 'Remove a saved preference by its id', schema: z.object({ id: z.string() }) },
  add_listing: { description: 'Add a listing from the most recent listings to the closet, by its number (1 = first). Takes a few seconds.', schema: z.object({ number: z.number().int().min(1) }) },
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

async function piecesById(ctx: ToolContext, ids: string[]): Promise<Garment[]> {
  return (await ctx.repo.listGarments(ctx.user.userId)).filter((g) => ids.includes(g.id))
}

/** A pieces card of these pieces as they are now */
async function shown(ctx: ToolContext, ids: string[], summary: string) {
  const gs = await piecesById(ctx, ids)
  ctx.cards.push({ kind: 'pieces', pieces: gs.map((g) => ({ id: g.id, name: g.name, cutoutUrl: g.cutoutUrl, status: g.status })) })
  return { ok: true, summary }
}

/** A planned look as a tool result, with its card */
function look(ctx: ToolContext, plan: Awaited<ReturnType<typeof planToday>>) {
  if (!plan.result.ok) return { error: 'insufficient_wardrobe', missing: plan.result.missing, summary: `Can’t make an outfit yet — no clean ${plan.result.missing.join(' or ')}.` }
  const { outfit, pieces } = plan.result
  ctx.cards.push(outfitCard(outfit, pieces))
  const notes = outfit.ruleReport.filter((r) => !r.passed).map((r) => r.note)
  return { outfitId: outfit.id, title: outfit.title, pieces: pieces.map((p) => `${p.name} (${p.id})`), rationale: outfit.rationale,
    ...(notes.length ? { problems: notes } : {}),
    summary: `${outfit.title}: ${pieces.map((p) => p.name).join(', ')}.${plan.day.changeSuggestion ? ` ${plan.day.changeSuggestion}` : ''}` }
}

export function outfitCard(o: Outfit, pieces: Garment[]): Card {
  return { kind: 'outfit', outfitId: o.id, date: o.contextDate, ...(o.renderUrl ? { imageUrl: o.renderUrl } : {}),
    pieces: pieces.map((p) => ({ id: p.id, name: p.name, cutoutUrl: p.cutoutUrl })) }
}

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
        .filter((g) => (!a.category || g.category === a.category) && (!q || `${g.name} ${g.category} ${g.colors.join(' ')} ${g.brand ?? ''} ${g.fit ?? ''} ${g.tags.join(' ')}`.toLowerCase().includes(q)))
      return { count: gs.length, pieces: gs.slice(0, 40).map((g) => ({ id: g.id, name: g.name, category: g.category, status: g.status, ...(g.brand ? { brand: g.brand } : {}), ...(g.fit ? { fit: g.fit } : {}) })),
        summary: gs.length ? `${gs.length} match: ${gs.slice(0, 5).map((g) => g.name).join(', ')}` : 'Nothing like that in the closet.' }
    }
    case 'plan_outfit':
    case 'another_look':
      return look(ctx, await planToday(repo, user, { date: await today(ctx, a.date), fresh: true, wish: a.wish, models: ctx.models }))
    case 'swap_piece': {
      const outfit = await repo.getOutfit(user.userId, a.outfitId)
      if (!outfit) return { error: 'no such outfit' }
      return look(ctx, await planToday(repo, user, { fresh: true, swap: { outfitId: outfit.id, drop: a.drop, wish: a.wish }, models: ctx.models }))
    }
    case 'set_status': {
      const gs = await piecesById(ctx, a.ids)
      for (const g of gs) await repo.updateGarment(user.userId, g.id, washPatch(g, { status: a.status }))
      return shown(ctx, a.ids, `${gs.map((g) => g.name).join(', ')} → ${a.status === 'laundry' ? 'in the laundry' : a.status}.`)
    }
    case 'edit_piece': {
      const [g] = await piecesById(ctx, [a.id])
      if (!g) return { error: 'no such piece' }
      const patch = Object.fromEntries((['name', 'brand', 'fit', 'tags'] as const).filter((k) => a[k] !== undefined).map((k) => [k, a[k]]))
      await repo.updateGarment(user.userId, g.id, patch)
      return shown(ctx, [g.id], `Updated ${g.name}.`)
    }
    case 'delete_piece': {
      const [g] = await piecesById(ctx, [a.id])
      if (!g) return { error: 'no such piece' }
      if (!a.confirm) return { error: 'ask the owner first, then call again with confirm: true', piece: g.name }
      await repo.deleteGarment(user.userId, g.id)
      return { ok: true, summary: `Removed ${g.name}.` }
    }
    case 'remember': {
      const profile = await profileFor(repo, user.userId)
      const notes = profile.stylistNotes ?? []
      if (notes.length >= MAX_NOTES) return { error: 'Too many notes — forget one first.' }
      await repo.upsertProfile({ ...profile, stylistNotes: [...notes, { id: randomUUID().slice(0, 8), text: a.text, pieceIds: a.pieceIds ?? [] }] })
      return { ok: true, summary: `Noted: ${a.text}.` }
    }
    case 'forget': {
      const profile = await profileFor(repo, user.userId)
      const note = profile.stylistNotes?.find((n) => n.id === a.id)
      if (!note) return { error: 'no such note' }
      await repo.upsertProfile({ ...profile, stylistNotes: profile.stylistNotes!.filter((n) => n.id !== a.id) })
      return { ok: true, summary: `Forgot: ${note.text}.` }
    }
    case 'shop_search': {
      const products = await getProductSearch().search(a.query)
      if (!products.length) return { summary: 'No listings found for that.' }
      ctx.cards.push({ kind: 'listings', products })
      ctx.lastListings = products
      return { count: products.length, listings: products.map((p, i) => `${i + 1}. ${p.title} (${[p.store, p.price].filter(Boolean).join(', ')})`),
        summary: `Found ${products.length === 1 ? 'one listing' : `${products.length} listings`}. Pick one to add it, or reply with its number.` }
    }
    case 'add_listing': {
      const p = ctx.lastListings?.[(a.number as number) - 1]
      if (!p) return { error: ctx.lastListings ? `there are only ${ctx.lastListings.length} listings` : 'no listings shown yet — search first' }
      const started = await startListing(user.userId, p, { repo, models: ctx.models, storage: getStorage() })
      if (!started) return { error: 'couldn’t get that listing’s photo' }
      await started.run()
      const job = await repo.getScanJob(user.userId, started.job.id)
      if (job?.status !== 'review') return { error: job?.error ?? 'couldn’t cut out that photo' }
      const pieces = piecesFromScan(job, await repo.listGarments(user.userId, { confirmed: false }))
      for (const g of pieces) await repo.updateGarment(user.userId, g.id, { confirmed: true })
      ctx.cards.push({ kind: 'added', garmentIds: pieces.map((g) => g.id) })
      return { added: pieces.map((g) => ({ id: g.id, name: g.name })), summary: `Added ${pieces.map((g) => g.name).join(', ')}.` }
    }
    case 'plan_trip': {
      const trip = await createTrip(repo, user, { destination: a.destination, startDate: a.startDate, endDate: a.endDate, days: a.days }, { models: ctx.models, geocode: ctx.geocode })
      ctx.cards.push({ kind: 'trip', tripId: trip.id, destination: trip.destination, days: trip.dayPlans.length })
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
