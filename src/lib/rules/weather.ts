import type { Garment } from '@/lib/domain/types'
import { layer } from '@/lib/domain/layers'
import type { Rule, RuleContext, Violation } from './types'
import { piecesOf } from './types'

const LAYERS = new Set(['top', 'onepiece', 'outerwear'])

export function outfitWarmth(gs: Garment[]): number {
  return gs.filter((g) => LAYERS.has(g.category)).reduce((s, g) => s + g.warmth, 0)
}

/** Warmth band by the day's low (plan Task 3). */
export function warmthBand(tempLowC: number): [number, number] {
  if (tempLowC >= 22) return [1, 4]
  if (tempLowC >= 15) return [2, 6]
  if (tempLowC >= 8) return [4, 8]
  return [7, Infinity]
}

export const RAIN_THRESHOLD = 50

/** The warmest look the clean closet can make, one piece per layer: the warmest tee, shirt and knit stacked
 *  (or the warmest one-piece), plus the warmest outerwear. */
export function warmestPossible(ctx: RuleContext): number {
  const best = new Map<string, number>()
  for (const g of ctx.garments.values()) {
    const l = layer(g)
    if (l && g.status === 'clean' && LAYERS.has(g.category)) best.set(l, Math.max(best.get(l) ?? 0, g.warmth))
  }
  const tops = (best.get('base') ?? 0) + (best.get('shirt') ?? 0) + (best.get('knit') ?? 0)
  return Math.max(tops, best.get('onepiece') ?? 0) + (best.get('outerwear') ?? 0)
}

export const weather: Rule = {
  id: 'weather',
  kind: 'hard',
  check(c, ctx) {
    const gs = piecesOf(c, ctx)
    const w = ctx.day.weather
    const v: Violation[] = []
    const [lo, hi] = warmthBand(w.tempLowC)
    const warmth = outfitWarmth(gs)
    // a closet with no coat can't reach a cold day's band: ask for its warmest look instead of the impossible
    const ceiling = warmestPossible(ctx)
    if (ceiling < lo) {
      if (warmth < ceiling) v.push({ ruleId: 'weather', garmentIds: [], message: `Too light for a low of ${w.tempLowC}° — layer up to ${ceiling}, the warmest this closet allows` })
    } else if (warmth < lo) v.push({ ruleId: 'weather', garmentIds: [], message: `Too light for a low of ${w.tempLowC}°` })
    if (warmth > hi) v.push({ ruleId: 'weather', garmentIds: [], message: `Too warm for a low of ${w.tempLowC}°` })
    if (w.rainProbability >= RAIN_THRESHOLD) {
      for (const g of gs.filter((g) => !g.rainSafe))
        v.push({ ruleId: 'weather', garmentIds: [g.id], message: `${g.name} won't survive ${w.rainProbability}% rain` })
    }
    return v
  },
  note(_c, ctx) {
    const w = ctx.day.weather
    const rain = w.rainProbability >= RAIN_THRESHOLD ? `, rain-safe for ${w.rainProbability}% rain` : ''
    if (warmestPossible(ctx) < warmthBand(w.tempLowC)[0]) return `Weather: the warmest your closet allows for ${w.tempLowC}°${rain} — a coat would help`
    return `Weather: layered for ${w.tempLowC}° to ${w.tempHighC}°${rain}`
  },
}
