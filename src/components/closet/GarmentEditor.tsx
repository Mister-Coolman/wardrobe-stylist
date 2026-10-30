'use client'
import { useState } from 'react'
import type { Category, Fit, Garment, Level } from '@/lib/domain/types'
import { CATEGORY, FIT, FORMALITY, WARMTH } from '@/lib/ui/format'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { Tag } from '@/components/ui/Tag'

const LEVELS: Level[] = [1, 2, 3, 4, 5]

export function GarmentEditor({ garment, onClose, onSaved, onDeleted, reviewing = false }: {
  garment: Garment | null; onClose: () => void; onSaved: (g: Garment) => void; onDeleted: (id: string) => void; reviewing?: boolean
}) {
  return (
    <Sheet open={!!garment} onClose={onClose} label={garment ? `Edit ${garment.name}` : 'Edit piece'}>
      {garment && <EditorBody key={garment.id} garment={garment} onSaved={onSaved} onDeleted={onDeleted} reviewing={reviewing} />}
    </Sheet>
  )
}

function EditorBody({ garment, onSaved, onDeleted, reviewing }: { garment: Garment; onSaved: (g: Garment) => void; onDeleted: (id: string) => void; reviewing: boolean }) {
  const [g, setG] = useState(garment)
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [details, setDetails] = useState(garment.tags.join(', '))
  const set = <K extends keyof Garment>(k: K, v: Garment[K]) => setG((x) => ({ ...x, [k]: v }))

  async function save() {
    setBusy('save'); setError(null)
    const tags = details.split(',').map((t) => t.trim()).filter(Boolean)
    const patch = { name: g.name, category: g.category, formality: g.formality, warmth: g.warmth, rainSafe: g.rainSafe, status: g.status,
      brand: g.brand?.trim() || null, fit: g.fit ?? null, tags, ...(reviewing ? { confirmed: true } : {}) }
    const res = await fetch('/api/garments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id, patch }) })
    setBusy(null)
    if (!res.ok) return setError('Couldn’t save that. Try again.')
    onSaved({ ...g, ...patch, wearsSinceWash: g.status === 'clean' && garment.status !== 'clean' ? 0 : g.wearsSinceWash })
  }
  async function remove() {
    setBusy('delete'); setError(null)
    const res = await fetch('/api/garments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id }) })
    setBusy(null)
    if (!res.ok) return setError('Couldn’t delete that. Try again.')
    onDeleted(g.id)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className="h-24 w-24 shrink-0 bg-studio p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={g.cutoutUrl} alt="" className="h-full w-full object-contain" />
        </div>
        <label className="field flex-1">
          <span>Name</span>
          <input className="input" value={g.name} onChange={(e) => set('name', e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Category</span>
        <select className="input" value={g.category} onChange={(e) => set('category', e.target.value as Category)}>
          {(Object.keys(CATEGORY) as Category[]).map((c) => <option key={c} value={c}>{CATEGORY[c]}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Brand</span>
        <input className="input" value={g.brand ?? ''} placeholder="e.g. Nautica" onChange={(e) => set('brand', e.target.value)} />
      </label>
      <fieldset className="field">
        <span>Fit</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FIT) as Fit[]).map((f) => <Tag key={f} selected={g.fit === f} onClick={() => set('fit', g.fit === f ? null : f)}>{FIT[f]}</Tag>)}
        </div>
      </fieldset>
      <label className="field">
        <span>Details</span>
        <input className="input" value={details} placeholder="e.g. pique, deck polo, tapered" onChange={(e) => setDetails(e.target.value)} />
        <span className="text-sm text-ink-muted">Material, cut, anything the stylist should know. Separate with commas.</span>
      </label>
      <fieldset className="field">
        <span>Dress code</span>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => <Tag key={l} selected={g.formality === l} onClick={() => set('formality', l)}>{FORMALITY[l]}</Tag>)}
        </div>
      </fieldset>
      <fieldset className="field">
        <span>Warmth</span>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => <Tag key={l} selected={g.warmth === l} onClick={() => set('warmth', l)}>{WARMTH[l]}</Tag>)}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Tag selected={g.rainSafe} onClick={() => set('rainSafe', !g.rainSafe)}>Rain-safe</Tag>
        {!reviewing && <Tag selected={g.status === 'laundry'} onClick={() => set('status', g.status === 'laundry' ? 'clean' : 'laundry')}>In the laundry</Tag>}
      </div>
      {error && <p role="alert" className="text-error">{error}</p>}
      <div className="flex items-center justify-between gap-4">
        <Button variant="tertiary" onClick={remove} loading={busy === 'delete'}>Delete piece</Button>
        <Button onClick={save} loading={busy === 'save'}>{reviewing ? 'Keep piece' : 'Save'}</Button>
      </div>
    </div>
  )
}
