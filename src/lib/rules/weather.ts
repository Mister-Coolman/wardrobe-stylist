import type { Garment, Profile, Weather } from '@/lib/domain/types'
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

/** From this daytime high (57°F) someone who runs warm needs one layer; from 20° (68°F) a knit over it is too much */
const WARM_DAY = 14, HOT_DAY = 20

/** Whether the owner runs warm or cold, from the latest note that says so */
export const runsOf = (p?: Pick<Profile, 'stylistNotes'>) => p?.stylistNotes?.filter((n) => n.runs).at(-1)?.runs

/** The day's warmth band for this owner. Running warm, a mild day goes by its high (the morning chill is brief) and
 *  otherwise counts 5° warmer; running cold counts 4° colder. */
export function warmthBandFor(w: Weather, runs?: 'warm' | 'cold'): [number, number] {
  if (runs === 'warm') return w.tempHighC >= WARM_DAY ? [1, w.tempHighC >= HOT_DAY ? 3 : 5] : warmthBand(w.tempLowC + 5)
  return warmthBand(w.tempLowC - (runs === 'cold' ? 4 : 0))
}
const warmByDay = (w: Weather, runs?: 'warm' | 'cold') => runs === 'warm' && w.tempHighC >= WARM_DAY

/** The warmest look the clean closet can make, one piece per layer: the warmest tee, shirt and knit stacked
 *  (or the warmest one-piece), plus the warmest outerwear. */
export function warmestPossible(ctx: Pick<RuleContext, 'garments'>): number {
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
    const runs = runsOf(ctx.profile)
    const [lo, hi] = warmthBandFor(w, runs)
    const warmth = outfitWarmth(gs)
    // a closet with no coat can't reach a cold day's band: ask for its warmest look instead of the impossible
    const ceiling = warmestPossible(ctx)
    if (ceiling < lo) {
      // no warmth number: the owner reads this too, and the model already sees each piece's warmth
      if (warmth < ceiling) v.push({ ruleId: 'weather', garmentIds: [], message: `Too light for a low of ${w.tempLowC}° — wear your warmest layers; a coat would help` })
    } else if (warmth < lo) v.push({ ruleId: 'weather', garmentIds: [], message: `Too light for a low of ${w.tempLowC}°` })
    // a piece asked for by name is the owner's call: running warm in it is noted, not refused
    if (warmth > hi && !ctx.insist?.length) v.push({ ruleId: 'weather', garmentIds: [], message: warmByDay(w, runs) ? `Too warm for a high of ${w.tempHighC}° when you run warm` : `Too warm for a low of ${w.tempLowC}°` })
    if (w.rainProbability >= RAIN_THRESHOLD) {
      for (const g of gs.filter((g) => !g.rainSafe))
        v.push({ ruleId: 'weather', garmentIds: [g.id], message: `${g.name} won't survive ${w.rainProbability}% rain` })
    }
    return v
  },
  note(c, ctx) {
    const w = ctx.day.weather
    const rain = w.rainProbability >= RAIN_THRESHOLD ? `, rain-safe for ${w.rainProbability}% rain` : ''
    const runs = runsOf(ctx.profile)
    if (ctx.insist?.length && outfitWarmth(piecesOf(c, ctx)) > warmthBandFor(w, runs)[1]) return `Weather: warmer than a ${w.tempHighC}° high calls for, as you asked${rain}`
    if (warmestPossible(ctx) < warmthBandFor(w, runs)[0]) return `Weather: as warm as your closet goes for ${w.tempLowC}°${rain} — a coat would help`
    return `Weather: ${warmByDay(w, runs) ? `one layer for a ${w.tempHighC}° high, as you run warm` : runs === 'cold' ? `layered warmer for ${w.tempLowC}° to ${w.tempHighC}°, as you run cold` : `layered for ${w.tempLowC}° to ${w.tempHighC}°`}${rain}`
  },
}
