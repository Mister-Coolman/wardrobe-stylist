import type { Garment, Outfit } from '@/lib/domain/types'

/** The checks that ran (✓) and what got swapped on the way (↺), typeset like annotations. */
export function FittingNotes({ outfit, pieces, wardrobe, bestEffort }: { outfit: Outfit; pieces: Garment[]; wardrobe: Garment[]; bestEffort: boolean }) {
  const name = (id: string) => wardrobe.find((g) => g.id === id)?.name ?? 'a piece'
  const swaps: { out: string; in: string | null; why: string }[] = []
  const seen = new Set<string>()
  for (const round of outfit.revisionLog) for (const r of round.rejected) for (const v of r.violations) for (const id of v.garmentIds) {
    if (seen.has(id) || outfit.garmentIds.includes(id)) continue
    seen.add(id)
    const cat = wardrobe.find((g) => g.id === id)?.category
    swaps.push({ out: name(id), in: pieces.find((p) => p.category === cat)?.name ?? null, why: v.message })
  }
  return (
    <section className="mt-10">
      <h2 className="label text-ink-muted">Fitting notes</h2>
      <ul aria-label="Fitting notes" className="mt-3 flex flex-col gap-2 text-sm">
        {outfit.ruleReport.map((r) => (
          <li key={r.ruleId} className="flex gap-3">
            <span aria-hidden className={r.passed ? 'text-ok' : 'text-warn'}>{r.passed ? '✓' : '!'}</span>
            <span><span className="sr-only">{r.passed ? 'Passed: ' : 'Not met: '}</span>{r.note}</span>
          </li>
        ))}
        {swaps.map((s) => (
          <li key={s.out} className="flex gap-3">
            <span aria-hidden className="text-warn">↺</span>
            <span>
              <span className="sr-only">Revised: </span>Swapped <s>{s.out}</s>{s.in ? <> → {s.in}</> : null} — {lower(s.why)}
            </span>
          </li>
        ))}
      </ul>
      {bestEffort && <p className="mt-3 text-sm text-warn">Best I could do with what’s clean. A scan of a few more pieces would help.</p>}
    </section>
  )
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
