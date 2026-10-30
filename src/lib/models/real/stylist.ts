// muse-spark-1.3 (POST /v1/chat/completions, JSON schema) for outfits, events, gaps and style;
// POST /v1/responses with the web_search tool for product search (search grounding is Responses-only).
import { z } from 'zod'
import type { Candidate, Garment, Level } from '@/lib/domain/types'
import { GarmentTagsSchema, StyleProfileSchema } from '../schemas'
import type { ProposeInput, Stylist } from '../types'
import { metaFetch, structured, toDataUrl } from './client'

const level = z.number().int().min(1).max(5)
const Looks = z.object({ looks: z.array(z.object({
  title: z.string(), pieces: z.array(z.string()), why: z.array(z.object({ piece: z.string(), reason: z.string() })),
})) })

const RULES = `You are a sharp personal stylist. Build complete outfits ONLY from the numbered pieces listed — refer to them by their key (p1, p2…).
Every look needs a top and a bottom (or a one-piece), plus shoes when the wardrobe has any; add outerwear when it's cold or wet.
Dress code is a 1–5 level (1 sporty · 2 casual · 3 smart casual · 4 smart · 5 formal); the look's least formal core piece must be at least the required level and not more than two levels above.
Warmth: sum of top/one-piece/outerwear warmth should suit the day's low (≥22° → 1–4, 15–21° → 2–6, 8–14° → 4–8, <8° → 7+). At 50%+ rain every piece must be rain-safe.
Honour the owner's standing preferences unless a rule above forbids it.
Fit is the owner's note on how a piece sits: keep proportions balanced (slim with slim or classic; an oversized top over something slimmer). Only use pieces whose status is clean. Each reason is one short, specific line ("Handles the 5pm rain"). Titles are 2–4 words ("Rain-ready client day").`

/** Short keys instead of UUIDs: models garble long ids. */
function keyed(wardrobe: Garment[]) {
  const toKey = new Map(wardrobe.map((g, i) => [g.id, `p${i + 1}`]))
  const toId = new Map(wardrobe.map((g, i) => [`p${i + 1}`, g.id]))
  const listing = wardrobe.map((g) => ({
    key: toKey.get(g.id), name: g.name, category: g.category, subcategory: g.subcategory, colors: g.colors,
    formality: g.formality, warmth: g.warmth, rainSafe: g.rainSafe, status: g.status, tags: g.tags,
    ...(g.brand ? { brand: g.brand } : {}), ...(g.fit ? { fit: g.fit } : {}),
  }))
  return { toKey, toId, listing }
}

function dayBrief(input: ProposeInput) {
  const d = input.day, w = d.weather
  return {
    date: d.date, requiredFormality: d.requiredFormality,
    weather: `${w.tempLowC}° to ${w.tempHighC}°, ${w.rainProbability}% rain, wind ${w.windKph} km/h, ${w.summary}`,
    events: d.events.map((e) => `${e.allDay ? 'all day' : e.start ?? 'sometime'} ${e.title}${e.formality ? ` (dress ${e.formality})` : ''}`),
    ...(input.trip ? { alreadyWornThisTrip: input.trip.counts } : {}),
    ...(input.styleProfile ? { style: input.styleProfile } : {}),
    ...(input.extraGuidance ? { note: input.extraGuidance } : {}),
    ...(input.notes?.length ? { preferences: input.notes } : {}),
  }
}

function toCandidates(r: z.infer<typeof Looks>, toId: Map<string, string>): Candidate[] {
  // unknown keys pass through as-is so the rule engine reports them as "Unknown piece"
  return r.looks.map((l) => ({
    title: l.title,
    garmentIds: l.pieces.map((k) => toId.get(k) ?? k),
    rationale: Object.fromEntries(l.why.map((w) => [toId.get(w.piece) ?? w.piece, w.reason])),
  }))
}

async function looks(input: ProposeInput, extra: string): Promise<Candidate[]> {
  const { toKey, toId, listing } = keyed(input.wardrobe)
  const avoid = (input.avoidOutfits ?? []).map((ids) => ids.map((id) => toKey.get(id)).filter(Boolean))
  const keys = (ids?: string[]) => (ids ?? []).map((id) => toKey.get(id)).filter(Boolean).join(', ')
  const asks = [
    input.keep?.length ? ` Keep pieces ${keys(input.keep)} in every look.` : '',
    input.drop?.length ? ` Do not use ${keys(input.drop)}.` : '',
    input.wish ? ` The owner wants: ${input.wish}.` : '',
    input.referenceImageUrl ? ' Match the look in the photo as closely as the closet allows; where it can’t, say why in the reasons.' : '',
  ].join('')
  const text = JSON.stringify({ task: `Propose ${input.count} different looks.${asks}${extra}`, day: dayBrief(input), pieces: listing,
    ...(avoid.length ? { alreadyShown: avoid } : {}) })
  const r = await structured('stylist', Looks, 'looks', [
    { role: 'system', content: RULES },
    { role: 'user', content: input.referenceImageUrl
      ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: await toDataUrl(input.referenceImageUrl, 1024) } }]
      : text },
  ], { ms: 60_000, effort: 'low' })
  return toCandidates(r, toId).slice(0, input.count)
}

export const realStylist: Stylist = {
  async classifyEvents(events) {
    if (!events.length) return {}
    const r = await structured('stylist', z.object({ events: z.array(z.object({ title: z.string(), formality: level })) }), 'event_dress_codes', [
      { role: 'system', content: 'Rate how dressed-up each calendar event needs the person to be: 1 sporty (gym, run) · 2 casual (errands, standup) · 3 smart casual (dinner, drinks, date) · 4 smart (client meeting, interview, presentation) · 5 formal (wedding, gala). Return every title exactly as given.' },
      { role: 'user', content: JSON.stringify(events.map((e) => e.title)) },
    ], { effort: 'minimal' })
    return Object.fromEntries(r.events.map((e) => [e.title, e.formality as Level]))
  },
  async propose(input) {
    return looks(input, ' Make them genuinely different from each other.')
  },
  async revise(input) {
    const { toKey } = keyed(input.wardrobe)
    const feedback = input.rejected.map((r) => ({
      look: r.candidate.garmentIds.map((id) => toKey.get(id) ?? `${id} (not in the closet)`),
      problems: r.violations.map((v) => v.message),
    }))
    return looks(input, ` These were rejected — fix every problem listed and do not repeat them: ${JSON.stringify(feedback)}`)
  },
  async suggestGaps(wardrobe) {
    const { listing } = keyed(wardrobe)
    const r = await structured('stylist', z.object({ items: z.array(GarmentTagsSchema).max(5) }), 'closet_gaps', [
      { role: 'system', content: 'Suggest up to 5 single pieces this person does not own that would make the most new complete outfits with what they have, across a smart dry day, a casual rainy day and a casual cold day. Be specific (colour, material, item), and suit what they own: give the fit that works with the fits of their pieces, and a brand when they lean on one. Never suggest something they already own.' },
      { role: 'user', content: JSON.stringify(listing) },
    ], { ms: 60_000, effort: 'low' })
    return r.items
  },
  async styleFromImages(imageUrls) {
    const images = await Promise.all(imageUrls.slice(0, 12).map((u) => toDataUrl(u, 768)))
    const r = await structured('stylist', StyleProfileSchema.omit({ sourceImages: true }), 'style_profile', [
      { role: 'system', content: 'From screenshots of outfits someone likes, describe their style for a wardrobe app. summary: one sentence. traits: up to 6 short words (tailored, minimal, wool…). palette: up to 6 plain colour words. avoid: up to 6 words for things clearly absent or off-style (logo, neon…).' },
      { role: 'user', content: [{ type: 'text', text: 'Here are the screenshots.' }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))] },
    ], { ms: 60_000, effort: 'low' })
    return { ...r, sourceImages: imageUrls }
  },
  async searchProduct(item) {
    const res = await metaFetch('stylist', '/responses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'muse-spark-1.3', tools: [{ type: 'web_search', search_context_size: 'low' }],
        input: `Find one place to buy this online now: ${[item.brand, item.name, item.fit ? `${item.fit} fit` : null].filter(Boolean).join(' ')}. Reply with only the product name and price, e.g. "Acne Studios Chelsea boot — $480".` }),
    }, 45_000)
    const j = (await res.json()) as { output?: { type: string; content?: { type: string; text?: string; annotations?: { type: string; url: string; title: string }[] }[] }[] }
    const text = j.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')
    const cite = text?.annotations?.find((a) => a.type === 'url_citation')
    if (!text?.text || !cite) return null
    const [title, price] = text.text.replace(/\[[^\]]*\]\([^)]*\)/g, '').trim().split(/\s+[—–-]\s+/)
    return { title: title.slice(0, 80), url: cite.url, ...(price ? { price: price.slice(0, 20) } : {}) }
  },
}
