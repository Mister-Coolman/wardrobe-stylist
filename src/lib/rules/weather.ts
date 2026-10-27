import type { Garment } from '@/lib/domain/types'
import type { Rule, Violation } from './types'
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

export const weather: Rule = {
  id: 'weather',
  kind: 'hard',
  check(c, ctx) {
    const gs = piecesOf(c, ctx)
    const w = ctx.day.weather
    const v: Violation[] = []
    const [lo, hi] = warmthBand(w.tempLowC)
    const warmth = outfitWarmth(gs)
    if (warmth < lo) v.push({ ruleId: 'weather', garmentIds: [], message: `Too light for a low of ${w.tempLowC}°` })
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
    return `Weather: layered for ${w.tempLowC}° to ${w.tempHighC}°${rain}`
  },
}
