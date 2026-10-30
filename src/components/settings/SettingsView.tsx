'use client'
import { useState } from 'react'
import type { Profile } from '@/lib/domain/types'
import { Button } from '@/components/ui/Button'
import { PersonPhoto } from './PersonPhoto'
import { RenderModeChoice } from './RenderModeChoice'
import { StyleProfileEditor } from './StyleProfileEditor'
import { unitFor } from '@/lib/ui/temperature'
import { WearLimitsEditor } from './WearLimitsEditor'

type Status = { section: string; text: string; error?: boolean } | null

export function SettingsView({ profile, email }: { profile: Profile; email: string }) {
  const [p, setP] = useState(profile)
  const [city, setCity] = useState(profile.homeCity)
  const [status, setStatus] = useState<Status>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function save(section: string, body: object) {
    setBusy(section); setStatus(null)
    const res = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
    setBusy(null)
    if (!res?.ok) return setStatus({ section, text: res?.status === 422 ? 'Couldn’t find that place.' : 'Couldn’t save. Try again.', error: true })
    const { profile: next } = await res.json()
    setP(next); setCity(next.homeCity)
    setStatus({ section, text: 'Saved.' })
  }
  const note = (section: string) => status?.section === section && (
    <p role="status" className={`mt-3 text-sm ${status.error ? 'text-error' : 'text-ink-muted'}`}>{status.text}</p>
  )

  return (
    <>
      <h1 className="display text-3xl">Settings</h1>
      <p className="mt-1 text-sm text-ink-muted">{email}</p>

      <section className="mt-10">
        <h2 className="label text-ink-muted">Home</h2>
        <form className="mt-3 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void save('home', { homeCity: city, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }) }}>
          <label className="field flex-1"><span>Home city</span><input className="input" required value={city} onChange={(e) => setCity(e.target.value)} /></label>
          <button type="submit" className="press h-11 rounded-control border border-ink px-4 font-semibold" disabled={busy === 'home'}>Save</button>
        </form>
        <p className="mt-2 text-sm text-ink-muted">Time zone: {p.tz}</p>
        {note('home')}
      </section>

      <section className="mt-10">
        <h2 className="label text-ink-muted">Temperature</h2>
        <div role="radiogroup" aria-label="Temperature" className="mt-3 flex gap-6">
          {(['F', 'C'] as const).map((u) => (
            <label key={u} className="flex min-h-11 cursor-pointer items-center gap-2">
              <input type="radio" name="temp-unit" className="h-5 w-5 accent-[var(--ink)]" aria-label={`°${u}`} checked={unitFor(p) === u}
                onChange={() => { setP({ ...p, tempUnit: u }); void save('unit', { tempUnit: u }) }} />
              <span className="font-medium">°{u}</span>
            </label>
          ))}
        </div>
        {note('unit')}
      </section>

      <section className="mt-10">
        <h2 className="label text-ink-muted">Show outfits as</h2>
        <div className="mt-3"><RenderModeChoice value={p.renderMode} hasPhoto={!!p.personPhotoUrl} onChange={(m) => { setP({ ...p, renderMode: m }); void save('mode', { renderMode: m }) }} /></div>
        {note('mode')}
      </section>

      <section className="mt-10">
        <h2 className="label text-ink-muted">Try-on photo</h2>
        <div className="mt-3"><PersonPhoto url={p.personPhotoUrl} onChange={(u) => setP({ ...p, personPhotoUrl: u })} /></div>
      </section>

      <section className="mt-10">
        <h2 className="label text-ink-muted">Wears before a wash</h2>
        <div className="mt-3"><WearLimitsEditor value={p.wearLimits} onChange={(wearLimits) => setP({ ...p, wearLimits })} /></div>
        <Button variant="secondary" className="mt-4" loading={busy === 'limits'} onClick={() => save('limits', { wearLimits: p.wearLimits })}>Save rewear limits</Button>
        {note('limits')}
      </section>

      {process.env.NEXT_PUBLIC_FEATURE_STYLE === '1' && <StyleProfileEditor initial={p.styleProfile} />}

      <form method="post" action="/api/sign-out" className="mt-12 border-t border-rule pt-4">
        <button className="min-h-11 underline underline-offset-[3px]">Sign out</button>
      </form>
    </>
  )
}
