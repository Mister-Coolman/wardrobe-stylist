import type { RenderMode } from '@/lib/domain/types'

type WithOutfit = { result: { ok: true; outfit: { id: string; renderMode: RenderMode; renderUrl: string | null } } | { ok: false } }

/** Puts a finished render on the look it was requested for; a stale render for a replaced look is dropped. */
export function applyRender<P extends WithOutfit>(plan: P, outfitId: string, out: { renderMode: RenderMode; renderUrl: string | null }): P {
  if (!plan.result.ok || plan.result.outfit.id !== outfitId) return plan
  return { ...plan, result: { ...plan.result, outfit: { ...plan.result.outfit, renderMode: out.renderMode, renderUrl: out.renderUrl } } }
}
