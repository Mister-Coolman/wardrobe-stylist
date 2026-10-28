'use client'
import { useState } from 'react'
import type { StyleProfile } from '@/lib/domain/types'
import { Button } from '@/components/ui/Button'

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12)

/** Stretch: screenshots in, a style profile out — every field editable, nothing hidden. */
export function StyleProfileEditor({ initial }: { initial: StyleProfile | null }) {
  const [p, setP] = useState(initial)
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null)
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)

  async function upload(files: FileList) {
    setBusy('upload'); setStatus(null)
    const form = new FormData()
    Array.from(files).slice(0, 12).forEach((f) => form.append('images', f))
    const res = await fetch('/api/style', { method: 'POST', body: form }).catch(() => null)
    setBusy(null)
    if (!res?.ok) return setStatus({ text: 'Couldn’t read those screenshots. Try others.', error: true })
    setP((await res.json()).styleProfile)
  }
  async function save(next: StyleProfile | null) {
    setBusy('save'); setStatus(null)
    const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ styleProfile: next }) }).catch(() => null)
    setBusy(null)
    setStatus(res?.ok ? { text: next ? 'Saved.' : 'Style profile removed.' } : { text: 'Couldn’t save. Try again.', error: true })
    if (res?.ok) setP(next)
  }

  return (
    <section className="mt-10">
      <h2 className="label text-ink-muted">Your style</h2>
      <p className="mt-2 text-sm text-ink-muted">Add up to 12 screenshots of outfits you like — saved posts, shop pages, anything. Looks lean toward them; rules still come first.</p>
      <label className="press mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-control border border-ink px-4 font-semibold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        {busy === 'upload' ? 'Reading your screenshots…' : p ? 'Replace from screenshots' : 'Add screenshots'}
        <input type="file" accept="image/*" multiple className="sr-only" aria-label="Style screenshots" disabled={!!busy}
          onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = '' }} />
      </label>
      {p && (
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(p) }}>
          <label className="field"><span>In a sentence</span>
            <textarea className="input min-h-20" value={p.summary} maxLength={300} onChange={(e) => setP({ ...p, summary: e.target.value })} /></label>
          <label className="field"><span>Palette (comma-separated)</span>
            <input className="input" value={p.palette.join(', ')} onChange={(e) => setP({ ...p, palette: list(e.target.value) })} /></label>
          <label className="field"><span>Traits</span>
            <input className="input" value={p.traits.join(', ')} onChange={(e) => setP({ ...p, traits: list(e.target.value) })} /></label>
          <label className="field"><span>Avoid</span>
            <input className="input" value={p.avoid.join(', ')} onChange={(e) => setP({ ...p, avoid: list(e.target.value) })} /></label>
          <div className="flex items-center justify-between">
            <Button variant="tertiary" type="button" onClick={() => save(null)}>Remove</Button>
            <Button variant="secondary" type="submit" loading={busy === 'save'}>Save style</Button>
          </div>
        </form>
      )}
      {status && <p role="status" className={`mt-3 text-sm ${status.error ? 'text-error' : 'text-ink-muted'}`}>{status.text}</p>}
    </section>
  )
}
