'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { Garment, WearLimits } from '@/lib/domain/types'
import { plural, statusText } from '@/lib/ui/format'
import { Tag } from '@/components/ui/Tag'
import { GarmentEditor } from './GarmentEditor'
import { GarmentTile } from './GarmentTile'

type Filter = 'all' | 'tops' | 'bottoms' | 'shoes' | 'outer' | 'laundry'
const MATCH: Record<Filter, (g: Garment) => boolean> = {
  all: () => true,
  tops: (g) => g.category === 'top' || g.category === 'onepiece',
  bottoms: (g) => g.category === 'bottom',
  shoes: (g) => g.category === 'shoes',
  outer: (g) => g.category === 'outerwear',
  laundry: (g) => g.status === 'laundry',
}

export function ClosetView({ initial, limits, canSeed }: { initial: Garment[]; limits: WearLimits; canSeed: boolean }) {
  const [garments, setGarments] = useState(initial)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Garment | null>(null)
  const shown = useMemo(() => garments.filter(MATCH[filter]), [garments, filter])
  const laundry = garments.filter(MATCH.laundry).length

  if (!garments.length) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center">
        <p className="display text-2xl">Your closet is empty.<br />Scan it in a minute.</p>
        <Link href="/scan" className="press inline-flex h-12 items-center rounded-control bg-accent px-6 font-semibold text-paper">Scan closet</Link>
        {canSeed && (
          <form method="post" action="/api/dev/seed"><button className="min-h-11 text-ink-muted underline underline-offset-[3px]">Load the sample closet (development)</button></form>
        )}
      </div>
    )
  }

  const filters: [Filter, string][] = [['all', 'All'], ['tops', 'Tops'], ['bottoms', 'Bottoms'], ['shoes', 'Shoes'], ['outer', 'Outerwear'], ['laundry', laundry ? `Laundry ${laundry}` : 'Laundry']]
  return (
    <>
      <div className="flex items-baseline justify-between pr-12">
        <h1 className="display text-3xl">Closet</h1>
        <span className="text-sm text-ink-muted tnum">{plural(garments.length, 'piece')}</span>
      </div>
      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
        {filters.map(([f, label]) => <Tag key={f} selected={filter === f} onClick={() => setFilter(f)} className="shrink-0">{label}</Tag>)}
      </div>
      {shown.length ? (
        <ul className="mt-6 grid grid-cols-3 gap-x-3 gap-y-6">
          {shown.map((g) => (
            <li key={g.id}><GarmentTile garment={g} status={statusText(g, limits)} onOpen={() => setOpen(g)} /></li>
          ))}
        </ul>
      ) : (
        <p className="mt-12 text-center text-ink-muted">{filter === 'laundry' ? 'Nothing in the laundry.' : `No ${CATEGORY_LABEL[filter]} yet.`}</p>
      )}
      <div className="mt-10 border-t border-rule pt-4">
        <Link href="/scan" className="min-h-11 inline-flex items-center underline underline-offset-[3px]">Scan more pieces</Link>
      </div>
      <GarmentEditor garment={open} onClose={() => setOpen(null)}
        onSaved={(g) => { setGarments((gs) => gs.map((x) => (x.id === g.id ? g : x))); setOpen(null) }}
        onDeleted={(id) => { setGarments((gs) => gs.filter((x) => x.id !== id)); setOpen(null) }} />
    </>
  )
}

const CATEGORY_LABEL: Record<Filter, string> = { all: 'pieces', tops: 'tops', bottoms: 'bottoms', shoes: 'shoes', outer: 'outerwear', laundry: '' }
