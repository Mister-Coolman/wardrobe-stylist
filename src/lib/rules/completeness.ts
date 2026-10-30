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
    // shoes only once the closet has a clean pair: a closet of tops and bottoms still gets outfits
    if (!cats.has('shoes') && hasCleanShoes(ctx)) v.push({ ruleId: 'completeness', garmentIds: [], message: 'Missing shoes' })
    return v
  },
  note(c, ctx) {
    const pieces = piecesOf(c, ctx)
    return `Complete: ${pieces.length} pieces${pieces.some((g) => g.category === 'shoes') ? ', head to shoes' : ''}`
  },
}
