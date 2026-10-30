'use client'
import type { Garment, RenderMode } from '@/lib/domain/types'

const ORDER = ['outerwear', 'top', 'onepiece', 'bottom', 'shoes', 'accessory']

/** Full-bleed render (radius 0, 4:5) or, with no render, the cutouts laid out on studio gray. */
export function LookHero({ mode, url, pieces }: { mode: RenderMode; url: string | null; pieces: Garment[] }) {
  if (mode !== 'none' && url) {
    return (
      <div className="-mx-5 aspect-[4/5] bg-studio">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`The look, ${mode === 'tryon' ? 'worn' : mode === 'mannequin' ? 'on a mannequin' : 'laid flat'}`} className="settle-in h-full w-full object-cover" />
      </div>
    )
  }
  const sorted = [...pieces].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category))
  return (
    <ul aria-label="The look, piece by piece" className="-mx-5 grid aspect-[4/5] grid-cols-2 gap-px bg-paper">
      {sorted.map((g, i) => (
        <li key={g.id} className={`settle-in bg-studio p-4 ${sorted.length === 3 && i === 2 ? 'col-span-2' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={g.cutoutUrl} alt={g.name} className="h-full w-full object-contain" />
        </li>
      ))}
    </ul>
  )
}
