import { layer } from '@/lib/domain/layers'
import type { Garment } from '@/lib/domain/types'
import type { Rule, Violation } from './types'
import { piecesOf, type RuleContext } from './types'

const hasCleanShoes = (ctx: RuleContext) => [...ctx.garments.values()].some((g) => g.category === 'shoes' && g.status === 'clean')

export const completeness: Rule = {
  id: 'completeness',
  kind: 'hard',
  check(c, ctx) {
    const v: Violation[] = []
    const unknown = c.garmentIds.filter((id) => !ctx.garments.has(id))
    if (unknown.length) v.push({ ruleId: 'completeness', garmentIds: unknown, message: 'Unknown piece' })
    const cats = new Set(piecesOf(c, ctx).map((g) => g.category))
    if (!cats.has('onepiece') && !(cats.has('top') && cats.has('bottom'))) {
      const missing = cats.has('top') ? 'a bottom' : cats.has('bottom') ? 'a top' : 'a top and a bottom'
      v.push({ ruleId: 'completeness', garmentIds: [], message: `Missing ${missing}` })
    }
    // two polos under a quarter-zip, two pairs of jeans: one piece per layer
    const byLayer = new Map<string, Garment[]>()
    for (const g of piecesOf(c, ctx)) { const l = layer(g); if (l) byLayer.set(l, [...(byLayer.get(l) ?? []), g]) }
    for (const gs of byLayer.values()) {
      if (gs.length < 2) continue
      const sorted = [...gs].sort((a, b) => a.name.localeCompare(b.name))
      const names = sorted.map((g) => g.name)
      v.push({ ruleId: 'completeness', garmentIds: sorted.map((g) => g.id),
        message: `${names.slice(0, -1).join(', ')} and ${names.at(-1)} don't go on together — ${names.length === 2 ? 'one or the other' : 'pick one'}` })
    }
    // shoes only once the closet has a clean pair: a closet of tops and bottoms still gets outfits
    if (!cats.has('shoes') && hasCleanShoes(ctx)) v.push({ ruleId: 'completeness', garmentIds: [], message: 'Missing shoes' })
    return v
  },
  note(c, ctx) {
    const pieces = piecesOf(c, ctx)
    if (pieces.some((g) => g.category === 'shoes')) return `Head to toe: ${pieces.length} pieces`
    const sorted = pieces.some((g) => g.category === 'onepiece') ? 'One-piece sorted' : 'Top and bottom sorted'
    const anyShoes = [...ctx.garments.values()].some((g) => g.category === 'shoes')
    return `${sorted} — ${anyShoes ? 'no clean shoes today' : 'no shoes in the closet yet'}`
  },
}
