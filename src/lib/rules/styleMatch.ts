import type { Garment, StyleProfile } from '@/lib/domain/types'
import type { Rule } from './types'
import { piecesOf } from './types'

const words = (g: Garment) => [...g.colors, ...g.tags, ...g.name.toLowerCase().split(/\s+/)].map((w) => w.toLowerCase())
const hit = (g: Garment, list: string[]) => list.some((x) => words(g).includes(x.toLowerCase()))

function perPiece(g: Garment, s: StyleProfile): number {
  return (g.colors.some((c) => s.palette.map((p) => p.toLowerCase()).includes(c.toLowerCase())) ? 1 : 0) + (hit(g, s.traits) ? 1 : 0) - (hit(g, s.avoid) ? 1 : 0)
}

/** Stretch soft rule: (palette matches + trait matches − avoid matches) / pieces, clamped to 0–1. Never rejects. */
export const styleMatch: Rule = {
  id: 'styleMatch',
  kind: 'soft',
  check() { return [] },
  score(c, ctx) {
    const s = ctx.profile.styleProfile
    const gs = piecesOf(c, ctx)
    if (!s || !gs.length) return 0
    return Math.max(0, Math.min(1, gs.reduce((sum, g) => sum + perPiece(g, s), 0) / gs.length))
  },
  note(c, ctx) {
    const s = ctx.profile.styleProfile
    if (!s) return ''
    const on = piecesOf(c, ctx).filter((g) => perPiece(g, s) > 0).map((g) => g.name)
    return on.length ? `Your style: ${on.slice(0, 2).join(' and ')} fit what you save` : 'Your style: a step outside what you usually save'
  },
}
