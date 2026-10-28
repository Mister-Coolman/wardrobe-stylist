'use client'
import { useEffect, useState } from 'react'
import type { Gap } from '@/lib/stylist/gap'

const KEY = 'gap-dismissed-until'
const WEEK = 7 * 24 * 3600 * 1000

/** One suggestion, computed not invented: how many new outfits a single piece would make possible. Dismissible for a week. */
export function GapCard() {
  const [gap, setGap] = useState<Gap | null>(null)
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    let until = 0
    try { until = Number(localStorage.getItem(KEY) ?? 0) } catch { /* private mode */ }
    if (until > Date.now()) return
    setHidden(false)
    fetch('/api/gaps').then((r) => (r.ok ? r.json() : { gap: null })).then((j) => setGap(j.gap)).catch(() => {})
  }, [])
  if (hidden || !gap) return null
  return (
    <section aria-label="Closet gap" className="mt-10 border-t border-rule pt-6">
      <h2 className="label text-ink-muted">One piece to add</h2>
      <p className="mt-2">
        {gap.item.name} would make <span className="tnum font-semibold">{gap.newOutfits}</span> new outfit{gap.newOutfits === 1 ? '' : 's'} possible.
      </p>
      <div className="mt-2 flex items-center gap-6">
        {gap.product && (
          <a href={gap.product.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-[3px]">
            {gap.product.title}{gap.product.price ? ` · ${gap.product.price}` : ''}
          </a>
        )}
        <button type="button" className="min-h-11 text-ink-muted" onClick={() => {
          try { localStorage.setItem(KEY, String(Date.now() + WEEK)) } catch { /* private mode */ }
          setHidden(true)
        }}>Not now</button>
      </div>
    </section>
  )
}
