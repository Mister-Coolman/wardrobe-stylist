import type { Rule } from './types'

/** A swap: the look keeps these pieces and leaves those out. */
export function keepRule(keep: string[], drop: string[]): Rule {
  const name = (id: string, ctx: Parameters<Rule['check']>[1]) => ctx.garments.get(id)?.name ?? 'that piece'
  return {
    id: 'keep',
    kind: 'hard',
    check(c, ctx) {
      return [
        ...keep.filter((id) => !c.garmentIds.includes(id)).map((id) => ({ ruleId: 'keep', garmentIds: [id], message: `Keep ${name(id, ctx)}` })),
        ...drop.filter((id) => c.garmentIds.includes(id)).map((id) => ({ ruleId: 'keep', garmentIds: [id], message: `Leave out ${name(id, ctx)}` })),
      ]
    },
    note() {
      return 'Keeps the rest of the look'
    },
  }
}
