import type { Rule } from './types'
import { piecesOf } from './types'

export const availability: Rule = {
  id: 'availability',
  kind: 'hard',
  check(c, ctx) {
    return piecesOf(c, ctx).filter((g) => g.status !== 'clean').map((g) => ({
      ruleId: 'availability', garmentIds: [g.id],
      message: `${g.name} is ${g.status === 'laundry' ? 'in the laundry' : 'worn — due a wash'}`,
    }))
  },
  note() {
    return 'Clean: every piece is out of the laundry'
  },
}
