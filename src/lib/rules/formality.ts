import type { Garment, Level } from '@/lib/domain/types'
import type { Rule } from './types'
import { piecesOf } from './types'

export const FORMALITY_WORDS: Record<Level, string> = { 1: 'sporty', 2: 'casual', 3: 'smart casual', 4: 'smart', 5: 'formal' }
const CORE = new Set(['top', 'bottom', 'onepiece', 'shoes'])

const core = (gs: Garment[]) => gs.filter((g) => CORE.has(g.category))

/** Outfit formality is its least formal core piece. */
export function outfitFormality(gs: Garment[]): number {
  const c = core(gs)
  return c.length ? Math.min(...c.map((g) => g.formality)) : 0
}

export const formality: Rule = {
  id: 'formality',
  kind: 'hard',
  check(c, ctx) {
    const gs = piecesOf(c, ctx)
    const req = ctx.day.requiredFormality
    const f = outfitFormality(gs)
    if (!f) return []
    if (f < req) {
      const low = core(gs).filter((g) => g.formality < req)
      return [{ ruleId: 'formality', garmentIds: low.map((g) => g.id),
        message: `${low.map((g) => g.name).join(', ')} too casual for ${FORMALITY_WORDS[req]}` }]
    }
    if (f > req + 2) {
      return [{ ruleId: 'formality', garmentIds: core(gs).map((g) => g.id),
        message: `Too dressy for a ${FORMALITY_WORDS[req]} day` }]
    }
    return []
  },
  note(_c, ctx) {
    const req = ctx.day.requiredFormality
    const top = [...ctx.day.events].filter((e) => !e.allDay && e.formality).sort((a, b) => b.formality! - a.formality!)[0]
    return top ? `Dress code: ${top.title} → ${FORMALITY_WORDS[req]}` : `Dress code: ${FORMALITY_WORDS[req]}`
  },
}
