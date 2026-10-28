'use client'
import { useState } from 'react'

export function PersonPhoto({ url, onChange }: { url: string | null; onChange: (url: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function upload(f: File) {
    setBusy(true); setError(null)
    const form = new FormData()
    form.append('photo', f)
    const res = await fetch('/api/profile/photo', { method: 'POST', body: form }).catch(() => null)
    setBusy(false)
    if (!res?.ok) return setError('Couldn’t use that photo. Try another.')
    onChange((await res.json()).personPhotoUrl)
  }
  return (
    <div className="flex items-center gap-4">
      <div className="h-28 w-20 shrink-0 bg-studio">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt="Your try-on photo" className="h-full w-full object-cover" />}
      </div>
      <div className="flex flex-col items-start gap-1">
        <label className="press inline-flex min-h-11 cursor-pointer items-center rounded-control border border-ink px-4 font-semibold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          {busy ? 'Uploading…' : url ? 'Replace photo' : 'Add a photo'}
          <input type="file" accept="image/*" className="sr-only" aria-label="Photo of you" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }} />
        </label>
        {url && <button type="button" className="min-h-11 text-sm text-ink-muted underline underline-offset-[3px]"
          onClick={async () => { await fetch('/api/profile/photo', { method: 'DELETE' }); onChange(null) }}>Remove</button>}
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
      </div>
    </div>
  )
}
