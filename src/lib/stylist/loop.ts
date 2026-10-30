import type { Candidate, Category, Garment, Outfit, Profile, RenderMode, RevisionEntry } from '@/lib/domain/types'
import { ModelError, RENDER_TIMEOUT_MS, withTimeout } from '@/lib/models/types'
import type { Models, ProposeInput } from '@/lib/models/types'
import { CandidateSchema } from '@/lib/models/schemas'
import { dailyRules, runRules } from '@/lib/rules/registry'
import type { DayContext, Rule, RuleContext, TripUsage, Violation } from '@/lib/rules/types'

export interface PlanOutfitInput {
  day: DayContext; wardrobe: Garment[]; profile: Profile; models: Pick<Models, 'stylist' | 'renderer'>
  rules?: Rule[]; trip?: TripUsage; renderMode?: RenderMode
  /** garment-id sets already shown for this day ("Another look") */
  avoidOutfits?: string[][]
  /** stretch: friends' pick for the day, used by the pollWinner soft rule */
  poll?: RuleContext['poll']
}
export type PlanOutfitResult =
  | { ok: true; outfit: Omit<Outfit, 'id' | 'userId'>; bestEffort: boolean }
  | { ok: false; reason: 'insufficient_wardrobe'; missing: Category[] }

export const CANDIDATES = 3
export const MAX_REVISIONS = 2

/** Categories that stop any outfit from existing among clean pieces. Shoes are optional: tops and bottoms make an outfit. */
export function missingCategories(wardrobe: Garment[]): Category[] {
  const clean = new Set(wardrobe.filter((g) => g.confirmed && g.status === 'clean').map((g) => g.category))
  const missing: Category[] = []
  if (!clean.has('onepiece')) {
    if (!clean.has('top')) missing.push('top')
    if (!clean.has('bottom')) missing.push('bottom')
  }
  return missing
}

async function once<T>(f: () => Promise<T>): Promise<T> {
  try { return await f() } catch (e) {
    if (e instanceof ModelError) return f()
    throw e
  }
}

type Checked = { candidate: Candidate; violations: Violation[]; results: ReturnType<typeof runRules>['results']; softScore: number; order: number }

export async function planOutfit(input: PlanOutfitInput): Promise<PlanOutfitResult> {
  const missing = missingCategories(input.wardrobe)
  if (missing.length) return { ok: false, reason: 'insufficient_wardrobe', missing }

  const wardrobe = input.wardrobe.filter((g) => g.confirmed)
  const rules = input.rules ?? dailyRules
  const ctx: RuleContext = { garments: new Map(wardrobe.map((g) => [g.id, g])), day: input.day, profile: input.profile, trip: input.trip, poll: input.poll }
  const base: ProposeInput = { day: input.day, wardrobe, count: CANDIDATES, styleProfile: input.profile.styleProfile, avoidOutfits: input.avoidOutfits, trip: input.trip }
  const revisionLog: RevisionEntry[] = []
  const all: Checked[] = []
  let rejected: RevisionEntry['rejected'] = []
  const survivors: Checked[] = []

  for (let round = 0; round <= MAX_REVISIONS; round++) {
    let raw: unknown[]
    try {
      raw = round === 0
        ? await once(() => input.models.stylist.propose(base))
        : await once(() => input.models.stylist.revise({ ...base, rejected }))
    } catch (e) {
      if (round === 0 || !(e instanceof ModelError)) throw e
      break // revisions failed twice: fall through to best effort with what we have
    }
    const roundRejected: RevisionEntry['rejected'] = []
    for (const r of raw) {
      const parsed = CandidateSchema.safeParse(r)
      if (!parsed.success) {
        roundRejected.push({ candidate: { garmentIds: [], rationale: {}, title: 'Malformed suggestion' },
          violations: [{ ruleId: 'completeness', garmentIds: [], message: 'Malformed suggestion' }] })
        continue
      }
      // ids the model made up are dropped; the rest of its suggestion is judged on its merits
      const candidate = { ...parsed.data, garmentIds: parsed.data.garmentIds.filter((id) => ctx.garments.has(id)) }
      const res = runRules(candidate, ctx, rules)
      const checked = { candidate, ...res, order: all.length }
      all.push(checked)
      if (res.violations.length) roundRejected.push({ candidate, violations: res.violations })
      else survivors.push(checked)
    }
    if (roundRejected.length) revisionLog.push({ round, rejected: roundRejected })
    if (survivors.length) break
    rejected = roundRejected
  }

  let pick: Checked | undefined
  let bestEffort = false
  if (survivors.length) {
    pick = survivors.sort((a, b) => b.softScore - a.softScore || a.order - b.order)[0]
  } else {
    pick = all.sort((a, b) => a.violations.length - b.violations.length || a.order - b.order)[0]
    bestEffort = true
  }
  // never show a look with nothing real in it: fall back to the best combination the rules can find
  if (bestEffort && (!pick || corePieces(pick.candidate, ctx) < 2)) pick = fallback(ctx, rules) ?? pick
  if (!pick) throw new ModelError('stylist', 'bad_output', 'no usable candidates')

  const { renderMode, renderUrl } = await render(input, pick.candidate, ctx)
  return {
    ok: true,
    bestEffort,
    outfit: {
      ...pick.candidate, contextDate: input.day.date, ruleReport: pick.results, revisionLog,
      renderMode, renderUrl, source: 'agent',
    },
  }
}

const CORE = new Set(['top', 'bottom', 'onepiece', 'shoes'])
const corePieces = (c: Candidate, ctx: RuleContext) => c.garmentIds.filter((id) => CORE.has(ctx.garments.get(id)?.category ?? '')).length

/** Deterministic top × bottom × shoes (± outerwear) search, fewest hard violations first. */
function fallback(ctx: RuleContext, rules: Rule[]): Checked | undefined {
  const gs = [...ctx.garments.values()].filter((g) => g.status === 'clean')
  const by = (c: string) => gs.filter((g) => g.category === c)
  const bases = [...by('top').flatMap((t) => by('bottom').map((b) => [t.id, b.id])), ...by('onepiece').map((o) => [o.id])]
  let best: Checked | undefined
  let n = 0
  for (const base of bases) for (const shoe of by('shoes')) for (const o of [null, ...by('outerwear')]) {
    if (++n > 2000) return best
    const candidate: Candidate = { garmentIds: [...(o ? [o.id] : []), ...base, shoe.id], rationale: {}, title: 'Closest fit from your closet' }
    const res = runRules(candidate, ctx, rules)
    if (!best || res.violations.length < best.violations.length) best = { candidate, ...res, order: n }
    if (!res.violations.length) return best
  }
  return best
}

async function render(input: PlanOutfitInput, c: Candidate, ctx: RuleContext): Promise<{ renderMode: RenderMode; renderUrl: string | null }> {
  let mode = input.renderMode ?? input.profile.renderMode
  if (mode === 'tryon' && !input.profile.personPhotoUrl) mode = 'flatlay'
  if (mode === 'none') return { renderMode: 'none', renderUrl: null }
  const cutoutUrls = c.garmentIds.map((id) => ctx.garments.get(id)?.cutoutUrl).filter((u): u is string => !!u)
  try {
    const { url } = await withTimeout(
      input.models.renderer.render({ mode, cutoutUrls, personPhotoUrl: input.profile.personPhotoUrl ?? undefined }),
      RENDER_TIMEOUT_MS, 'renderer')
    return { renderMode: mode, renderUrl: url }
  } catch {
    return { renderMode: 'none', renderUrl: null }
  }
}
