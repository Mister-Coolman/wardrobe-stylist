'use client'
import { useEffect, useState } from 'react'
import type { Garment, WearLimits } from '@/lib/domain/types'
import { limitFor } from '@/lib/domain/wearLimits'
import { plural } from '@/lib/ui/format'

/** Checkbox state lives in localStorage — it's a per-device convenience. */
export function PackingList({ tripId, items, limits }: { tripId: string; items: { garment: Garment; days: number }[]; limits: WearLimits }) {
  const key = `packed:${tripId}`
  const [packed, setPacked] = useState<string[]>([])
  useEffect(() => { try { setPacked(JSON.parse(localStorage.getItem(key) ?? '[]')) } catch { /* private mode */ } }, [key])
  const toggle = (id: string) => setPacked((p) => {
    const next = p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ }
    return next
  })
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between">
        <h2 className="label text-ink-muted">Packing list</h2>
        <span className="text-sm text-ink-muted tnum">{packed.length}/{items.length} packed</span>
      </div>
      <ul aria-label="Packing list" className="mt-3 divide-y divide-rule border-y border-rule">
        {items.map(({ garment: g, days }) => {
          const limit = limitFor(g, limits)
          return (
            <li key={g.id}>
              <label className="flex min-h-14 cursor-pointer items-center gap-4 py-2">
                <input type="checkbox" className="h-5 w-5 accent-[var(--ink)]" checked={packed.includes(g.id)} onChange={() => toggle(g.id)} />
                <div className="h-11 w-11 shrink-0 bg-studio p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.cutoutUrl} alt="" className="h-full w-full object-contain" />
                </div>
                <span className={`flex-1 ${packed.includes(g.id) ? 'text-ink-faint line-through' : ''}`}>{g.name}</span>
                <span className="text-sm text-ink-muted tnum">{plural(days, 'day')}{limit != null ? ` · limit ${limit}` : ''}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
