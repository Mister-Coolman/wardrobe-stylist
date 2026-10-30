'use client'
import { useState } from 'react'
import type { Product } from '@/lib/shop/search'
import { Button } from '@/components/ui/Button'

const ERRORS: Record<string, string> = {
  not_set_up: 'Store search isn’t set up yet.',
  search_failed: 'Couldn’t reach the stores. Try again.',
}

/** Search store listings and pick one. `picking`: the listing being added, shown as busy. */
export function ShopSearch({ initialQuery = '', picking, onPick }: { initialQuery?: string; picking?: string | null; onPick: (p: Product) => void }) {
  const [q, setQ] = useState(initialQuery)
  const [results, setResults] = useState<Product[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (!q.trim()) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/shop?q=${encodeURIComponent(q.trim())}`).catch(() => null)
    const j = (await res?.json().catch(() => null)) as { products?: Product[]; error?: string } | null
    setBusy(false)
    if (!res?.ok || !j?.products) return setError(ERRORS[j?.error ?? ''] ?? ERRORS.search_failed)
    setResults(j.products)
  }

  return (
    <div className="flex flex-col gap-4">
      <form role="search" onSubmit={search} className="flex items-end gap-2">
        <label className="field flex-1">
          <span>Search stores</span>
          <input className="input" type="search" value={q} placeholder="e.g. black Under Armour sweatpants" onChange={(e) => setQ(e.target.value)} />
        </label>
        <Button type="submit" variant="secondary" loading={busy}>Search</Button>
      </form>
      {error && <p role="alert" className="text-error">{error}</p>}
      {results && !results.length && <p className="text-ink-muted">No listings found. Try the brand and the item, like “Nautica deck polo”.</p>}
      {results && results.length > 0 && (
        <ul aria-label="Store listings" className="grid grid-cols-2 gap-x-3 gap-y-5">
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={!!picking} aria-busy={picking === p.id || undefined} onClick={() => onPick(p)}
                aria-label={`${p.title}${p.store ? `, ${p.store}` : ''}${p.price ? `, ${p.price}` : ''}`}
                className={`press block w-full text-left disabled:opacity-60 ${picking === p.id ? 'opacity-100!' : ''}`}>
                <div className="aspect-square bg-studio p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
                </div>
                <div className="mt-2 line-clamp-2 text-sm font-medium leading-tight">{p.title}</div>
                <div className="mt-1 text-xs text-ink-muted tnum">{[p.store, p.price].filter(Boolean).join(' · ')}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
