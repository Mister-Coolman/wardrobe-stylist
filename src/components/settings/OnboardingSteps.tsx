'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { RenderMode, WearLimits } from '@/lib/domain/types'
import { Button } from '@/components/ui/Button'
import { PersonPhoto } from './PersonPhoto'
import { RenderModeChoice } from './RenderModeChoice'
import { WearLimitsEditor } from './WearLimitsEditor'

const STEPS = ['Home', 'You', 'Looks', 'Rewear'] as const

async function patch(body: object) {
  return fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

export function OnboardingSteps({ defaults }: { defaults: WearLimits }) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [city, setCity] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [mode, setMode] = useState<RenderMode>('flatlay')
  const [limits, setLimits] = useState<WearLimits>(defaults)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function saveCity(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const res = await patch({ homeCity: city, tz: Intl.DateTimeFormat().resolvedOptions().timeZone })
    setBusy(false)
    if (res.status === 422) return setError('Couldn’t find that place. Try the nearest city.')
    if (!res.ok) return setError('Couldn’t save that. Try again.')
    setStep(1)
  }

  return (
    <>
      <p className="label text-ink-muted tnum">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
      {step === 0 && (
        <form onSubmit={saveCity}>
          <h1 className="display mt-3 text-3xl">Where do you get dressed most mornings?</h1>
          <p className="mt-2 text-ink-muted">Sets your weather and time zone. Events in other cities use their own forecast.</p>
          <label className="field mt-8">
            <span>Home city</span>
            <input className="input" required value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </label>
          {error && <p role="alert" className="mt-3 text-error">{error}</p>}
          <Button type="submit" loading={busy} className="mt-8 w-full">Next</Button>
        </form>
      )}
      {step === 1 && (
        <>
          <h1 className="display mt-3 text-3xl">A photo of you, for try-on.</h1>
          <p className="mt-2 text-ink-muted">Optional. Full length, plain background. It’s only used to render your outfits.</p>
          <div className="mt-8"><PersonPhoto url={photo} onChange={(u) => { setPhoto(u); if (u) setMode('tryon') }} /></div>
          <div className="mt-8 flex items-center justify-between">
            <Button variant="tertiary" onClick={() => setStep(2)}>Skip for now</Button>
            {photo && <Button onClick={() => setStep(2)}>Next</Button>}
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h1 className="display mt-3 text-3xl">How should each look appear?</h1>
          <p className="mt-2 text-ink-muted">You can switch on any outfit.</p>
          <div className="mt-8"><RenderModeChoice value={mode} onChange={setMode} hasPhoto={!!photo} /></div>
          <Button className="mt-8 w-full" loading={busy} onClick={async () => { setBusy(true); await patch({ renderMode: mode }); setBusy(false); setStep(3) }}>Next</Button>
        </>
      )}
      {step === 3 && (
        <>
          <h1 className="display mt-3 text-3xl">How many wears before a wash?</h1>
          <p className="mt-2 text-ink-muted">Used for laundry and for packing enough on trips. Leave empty for no limit.</p>
          <div className="mt-8"><WearLimitsEditor value={limits} onChange={setLimits} /></div>
          <Button className="mt-8 w-full" loading={busy} onClick={async () => {
            setBusy(true)
            await patch({ wearLimits: limits })
            router.push('/scan')
          }}>Use these</Button>
        </>
      )}
    </>
  )
}
