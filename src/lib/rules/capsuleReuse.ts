import type { Rule } from './types'

/** Trip soft rule: prefer pieces already in the bag, so the suitcase stays small. */
export const capsuleReuse: Rule = {
  id: 'capsuleReuse',
  kind: 'soft',
  check() { return [] },
  score(c, ctx) {
    if (!c.garmentIds.length) return 0
    const counts = ctx.trip?.counts ?? {}
    return c.garmentIds.filter((id) => (counts[id] ?? 0) > 0).length / c.garmentIds.length
  },
  note(c, ctx) {
    const reused = c.garmentIds.filter((id) => (ctx.trip?.counts[id] ?? 0) > 0).length
    if (reused) return `Packing light: reuses ${reused} piece${reused === 1 ? '' : 's'} already in the bag`
    return Object.keys(ctx.trip?.counts ?? {}).length ? '' : 'Packing light: day one'
  },
}
