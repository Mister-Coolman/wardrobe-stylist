import type { Rule } from './types'

/** Soft rule: +1 for each pairing the owner told the stylist they like, held in full. Never rejects. */
export const likedPairs: Rule = {
  id: 'likedPairs',
  kind: 'soft',
  check() { return [] },
  score(c, ctx) {
    return (ctx.profile.stylistNotes ?? []).filter((n) => n.pieceIds.length >= 2 && n.pieceIds.every((id) => c.garmentIds.includes(id))).length
  },
  note(c, ctx) {
    return likedPairs.score!(c, ctx) ? 'A pairing you like' : 'No remembered pairing in this look'
  },
}
