import { DEFAULT_WEAR_LIMITS } from '@/lib/domain/wearLimits'
import type { Candidate, Garment, Level, Profile } from '@/lib/domain/types'
import { dailyRules, runRules, tripRules } from '@/lib/rules/registry'
import { RAIN_THRESHOLD } from '@/lib/rules/weather'
import type { RuleContext } from '@/lib/rules/types'
import { FIXTURE_GAPS } from '../fixtures/garments'
import type { ProposeInput, Stylist } from '../types'

const KEYWORDS: [RegExp, Level][] = [
  [/client|interview|board|wedding|pitch|presentation/i, 4],
  [/dinner|drinks|date|party|theatre|theater/i, 3],
  [/gym|run|yoga|workout|climb|hike/i, 1],
]

const MOCK_PROFILE = { wearLimits: DEFAULT_WEAR_LIMITS } as Profile
const key = (ids: string[]) => [...ids].sort().join('+')

/** Enumerate combos and rank them with the real rules — a stand-in for the model's judgment. */
function ranked(input: ProposeInput, avoid: Set<string>, avoidPieces: Set<string>): { ids: string[]; bad: number }[] {
  const gs = input.wardrobe
  const by = (c: Garment['category']) => gs.filter((g) => g.category === c)
  const ctx: RuleContext = { garments: new Map(gs.map((g) => [g.id, g])), day: input.day, profile: MOCK_PROFILE, trip: input.trip }
  const rules = input.trip ? tripRules : dailyRules
  const outer = [null, ...by('outerwear')]
  const tops = by('top')
  const layers: (Garment[])[] = [...tops.map((t) => [t]),
    ...tops.filter((t) => t.subcategory === 'sweater').flatMap((s) => tops.filter((t) => t.id !== s.id && t.subcategory !== 'sweater').map((t) => [t, s]))]
  const bases: Garment[][] = [...layers.flatMap((l) => by('bottom').map((b) => [...l, b])), ...by('onepiece').map((o) => [o])]
  const out: { ids: string[]; bad: number; tie: number }[] = []
  const shoes: (Garment | null)[] = by('shoes').length ? by('shoes') : [null]
  for (const base of bases) for (const shoe of shoes) for (const o of outer) {
    const ids = [...(o ? [o.id] : []), ...base.map((g) => g.id), ...(shoe ? [shoe.id] : [])]
    const { violations, softScore } = runRules({ garmentIds: ids, rationale: {}, title: '' }, ctx, rules)
    const reused = ids.filter((id) => avoidPieces.has(id)).length
    const worn = ids.reduce((s, id) => s + (ctx.garments.get(id)!.wearCount ?? 0), 0)
    out.push({ ids, bad: violations.length + reused + (avoid.has(key(ids)) ? 1 : 0), tie: worn + ids.length * 0.1 - softScore * 2 })
    if (out.length > 4000) break
  }
  return out.sort((a, b) => a.bad - b.bad || a.tie - b.tie)
}

function toCandidate(ids: string[], input: ProposeInput): Candidate {
  const gs = ids.map((id) => input.wardrobe.find((g) => g.id === id)!)
  const w = input.day.weather
  const rationale: Record<string, string> = {}
  for (const g of gs) {
    rationale[g.id] =
      g.category === 'outerwear' ? `Takes the edge off ${w.tempLowC}°` :
      g.category === 'shoes' ? (w.rainProbability >= RAIN_THRESHOLD && g.rainSafe ? 'Shrugs off the rain' : 'Grounds the look') :
      g.formality >= input.day.requiredFormality + 1 ? 'Sharpens it for the day' : 'Easy base layer'
  }
  const rainy = w.rainProbability >= RAIN_THRESHOLD
  const mood = input.day.requiredFormality >= 4 ? 'client day' : input.day.requiredFormality === 1 ? 'off-duty' : 'weekday'
  const title = `${rainy ? 'Rain-ready' : w.tempLowC < 8 ? 'Cold-snap' : 'Easy'} ${mood}`
  return { garmentIds: ids, rationale, title: title.charAt(0).toUpperCase() + title.slice(1) }
}

function pick(input: ProposeInput, extraAvoid: string[][] = [], avoidPieces = new Set<string>()): Candidate[] {
  const avoid = new Set([...(input.avoidOutfits ?? []), ...extraAvoid].map(key))
  const list = ranked(input, avoid, avoidPieces)
  const good = list.filter((r) => r.bad === 0)
  const chosen: string[][] = []
  const add = (pool: typeof list, varied: boolean) => {
    for (const r of pool) {
      if (chosen.length >= input.count) return
      if (chosen.includes(r.ids)) continue
      // prefer variety: each new candidate changes at least two pieces
      if (varied && chosen.some((c) => r.ids.filter((id) => c.includes(id)).length > r.ids.length - 2)) continue
      chosen.push(r.ids)
    }
  }
  add(good, true)
  add(good, false)
  add(list, false)
  return chosen.map((ids) => toCandidate(ids, input))
}

export const mockStylist: Stylist = {
  async classifyEvents(events) {
    const out: Record<string, Level> = {}
    for (const e of events) out[e.title] = KEYWORDS.find(([re]) => re.test(e.title))?.[1] ?? 2
    return out
  },
  async propose(input) {
    const cs = pick(input)
    // Deliberate first mistake on rainy days so the revision path is visible (plan Task 4).
    if (input.day.weather.rainProbability >= RAIN_THRESHOLD && cs.length) {
      const unsafe = input.wardrobe.filter((g) => g.category === 'shoes' && !g.rainSafe && g.status === 'clean')
        .sort((a, b) => Math.abs(a.formality - input.day.requiredFormality) - Math.abs(b.formality - input.day.requiredFormality))[0]
      if (unsafe) {
        const ids = cs[0].garmentIds.filter((id) => input.wardrobe.find((g) => g.id === id)?.category !== 'shoes')
        cs[0] = toCandidate([...ids, unsafe.id], input)
      }
    }
    return cs
  },
  async revise(input) {
    const bad = new Set(input.rejected.flatMap((r) => r.violations.flatMap((v) => v.garmentIds)))
    return pick(input, input.rejected.map((r) => r.candidate.garmentIds), bad)
  },
  async suggestGaps() {
    return FIXTURE_GAPS
  },
  async searchProduct(item) {
    // no invented shop or price in mock mode: a shopping search for the exact piece
    return { title: `Shop ${item.name.toLowerCase()}`, url: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.name)}` }
  },
  async styleFromImages(imageUrls) {
    return { summary: 'Quiet, tailored neutrals with one warm accent.', traits: ['tailored', 'minimal', 'wool'],
      palette: ['navy', 'oat', 'charcoal', 'rust'], avoid: ['logo', 'neon'], sourceImages: imageUrls }
  },
}
