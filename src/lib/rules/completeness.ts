import type { Rule, Violation } from './types'
import { piecesOf } from './types'

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
    if (!cats.has('shoes')) v.push({ ruleId: 'completeness', garmentIds: [], message: 'Missing shoes' })
    return v
  },
  note(c, ctx) {
    return `Complete: ${piecesOf(c, ctx).length} pieces, head to shoes`
  },
}
