import { limitFor } from '@/lib/domain/wearLimits'
import type { Rule } from './types'
import { piecesOf } from './types'

/** Trip rule: a piece can be worn only as often as its rewear limit allows before a wash. */
export const wearLimit: Rule = {
  id: 'wearLimit',
  kind: 'hard',
  check(c, ctx) {
    const counts = ctx.trip?.counts ?? {}
    return piecesOf(c, ctx).flatMap((g) => {
      const limit = limitFor(g, ctx.profile.wearLimits)
      const used = counts[g.id] ?? 0
      return limit != null && used + 1 > limit
        ? [{ ruleId: 'wearLimit', garmentIds: [g.id], message: `${g.name} already worn ${used}× — limit ${limit} before a wash` }]
        : []
    })
  },
  note() {
    return 'Rewear: within your limits for every piece'
  },
}
