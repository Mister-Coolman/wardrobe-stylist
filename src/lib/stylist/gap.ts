import type { Garment, Profile } from '@/lib/domain/types'
import type { GarmentTags, Stylist } from '@/lib/models/types'
import { dailyRules, runRules } from '@/lib/rules/registry'
import type { DayContext, RuleContext } from '@/lib/rules/types'
import { styleMatch } from '@/lib/rules/styleMatch'

export const MAX_COMBOS = 5000
const HARD = dailyRules.filter((r) => r.kind === 'hard')

export type Product = { title: string; url: string; price?: string }
export type Gap = { item: GarmentTags; newOutfits: number; product: Product | null }

/** Smart/dry, casual/rain, casual/cold — the days a closet most often fails. */
export function REPRESENTATIVE_DAYS(date: string): DayContext[] {
  const base = { date, events: [], changeSuggestion: null }
  return [
    { ...base, requiredFormality: 4, weather: { tempHighC: 18, tempLowC: 12, rainProbability: 0, windKph: 10, summary: 'Dry' } },
    { ...base, requiredFormality: 2, weather: { tempHighC: 15, tempLowC: 10, rainProbability: 80, windKph: 15, summary: 'Rain' } },
    { ...base, requiredFormality: 2, weather: { tempHighC: 5, tempLowC: 0, rainProbability: 10, windKph: 20, summary: 'Cold' } },
  ]
}

// identical pieces (same tags) are one option, not two
const signature = (g: Pick<Garment, 'category' | 'subcategory' | 'colors' | 'formality' | 'warmth' | 'rainSafe'>) =>
  [g.category, g.subcategory, [...g.colors].sort().join('/'), g.formality, g.warmth, g.rainSafe].join('|')

function distinct(gs: Garment[]): Garment[] {
  const seen = new Map<string, Garment>()
  for (const g of gs) if (!seen.has(signature(g))) seen.set(signature(g), g)
  return [...seen.values()]
}

/** top×bottom×shoes (+ one-piece×shoes), shoes and outerwear optional, hard daily rules only; at most MAX_COMBOS checked. */
export function countValidOutfits(wardrobe: Garment[], day: DayContext, profile: Profile): number {
  const gs = distinct(wardrobe.filter((g) => g.confirmed && g.status === 'clean'))
  const by = (c: Garment['category']) => gs.filter((g) => g.category === c)
  const ctx: RuleContext = { garments: new Map(gs.map((g) => [g.id, g])), day, profile }
  const bases = [...by('top').flatMap((t) => by('bottom').map((b) => [t.id, b.id])), ...by('onepiece').map((o) => [o.id])]
  const outer: (string | null)[] = [null, ...by('outerwear').map((o) => o.id)]
  let checked = 0, valid = 0
  const shoes: (string | null)[] = by('shoes').length ? by('shoes').map((s) => s.id) : [null]
  for (const base of bases) for (const shoe of shoes) for (const o of outer) {
    if (++checked > MAX_COMBOS) return valid
    const ids = [...(o ? [o] : []), ...base, ...(shoe ? [shoe] : [])]
    if (!runRules({ garmentIds: ids, rationale: {}, title: '' }, ctx, HARD).violations.length) valid++
  }
  return valid
}

/** The one purchase that unlocks the most new outfits across the representative days; null when nothing helps. */
export async function closetGaps(args: {
  wardrobe: Garment[]; profile: Profile; stylist: Stylist; days: DayContext[]; productSearch: (g: GarmentTags) => Promise<Product | null>
}): Promise<Gap | null> {
  const candidates = await args.stylist.suggestGaps(args.wardrobe)
  const before = args.days.map((d) => countValidOutfits(args.wardrobe, d, args.profile))
  let best: { item: GarmentTags; newOutfits: number; style: number } | null = null
  for (const [i, item] of candidates.entries()) {
    const extra: Garment = { ...item, id: `gap-${i}`, userId: args.profile.userId, status: 'clean', wearLimitOverride: null, wearsSinceWash: 0,
      wearCount: 0, lastWornAt: null, cutoutUrl: '', photoUrl: '', confirmed: true }
    const n = args.days.reduce((s, d, j) => s + countValidOutfits([...args.wardrobe, extra], d, args.profile) - before[j], 0)
    // ties go to the piece closest to the user's style profile
    const style = styleMatch.score!({ garmentIds: [extra.id], rationale: {}, title: '' },
      { garments: new Map([[extra.id, extra]]), day: args.days[0], profile: args.profile })
    if (n > 0 && (!best || n > best.newOutfits || (n === best.newOutfits && style > best.style))) best = { item, newOutfits: n, style }
  }
  if (!best) return null
  return { item: best.item, newOutfits: best.newOutfits, product: await args.productSearch(best.item).catch(() => null) }
}
