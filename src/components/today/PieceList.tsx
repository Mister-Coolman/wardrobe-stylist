import type { Garment, Outfit } from '@/lib/domain/types'

export function PieceList({ outfit, pieces }: { outfit: Outfit; pieces: Garment[] }) {
  return (
    <section className="mt-10">
      <h2 className="label text-ink-muted">The pieces</h2>
      <ol aria-label="Pieces" className="mt-3 divide-y divide-rule border-y border-rule">
        {pieces.map((g, i) => (
          <li key={g.id} className="flex items-center gap-4 py-3">
            <span className="w-5 text-sm text-ink-faint tnum">{String(i + 1).padStart(2, '0')}</span>
            <div className="h-14 w-14 shrink-0 bg-studio p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.cutoutUrl} alt="" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="font-medium">{g.name}</div>
              {outfit.rationale[g.id] && <div className="text-sm text-ink-muted">{outfit.rationale[g.id]}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
