import type { Rule } from './types'

/** Soft rule: up to +0.5 for looks that match what friends voted for. Never rejects. */
export const pollWinner: Rule = {
  id: 'pollWinner',
  kind: 'soft',
  check() { return [] },
  score(c, ctx) {
    if (!ctx.poll || !c.garmentIds.length) return 0
    return 0.5 * c.garmentIds.filter((id) => ctx.poll!.garmentIds.includes(id)).length / c.garmentIds.length
  },
  note(c, ctx) {
    if (!ctx.poll) return ''
    const same = c.garmentIds.length === ctx.poll.garmentIds.length && c.garmentIds.every((id) => ctx.poll!.garmentIds.includes(id))
    return same ? `Friends picked this, ${ctx.poll.score}` : `Friends picked another look, ${ctx.poll.score}`
  },
}
