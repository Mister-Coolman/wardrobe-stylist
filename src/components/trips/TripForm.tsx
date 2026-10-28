'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'

export function TripForm({ defaults }: { defaults?: { destination: string; startDate: string; endDate: string } }) {
  const router = useRouter()
  const [f, setF] = useState(defaults ?? { destination: '', startDate: '', endDate: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const city = f.destination.trim()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (f.endDate < f.startDate) return setError('The trip ends before it starts.')
    setBusy(true); setError(null)
    const res = await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) }).catch(() => null)
    if (!res?.ok) { setBusy(false); return setError(res?.status === 400 ? 'Check the dates — trips can be up to three weeks.' : 'Couldn’t plan that trip. Try again.') }
    const { trip } = await res.json()
    router.push(`/trips/${trip.id}`)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="field">
        <span>Where to</span>
        <input className="input" required value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} autoComplete="off" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field"><span>From</span><input className="input tnum" type="date" required value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
        <label className="field"><span>Until</span><input className="input tnum" type="date" required value={f.endDate} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
      </div>
      {error && <p role="alert" className="text-error">{error}</p>}
      <Button type="submit" loading={busy} className="mt-2 w-[calc(100%-72px)]">{busy ? 'Packing…' : city ? `Pack for ${city}` : 'Pack for the trip'}</Button>
    </form>
  )
}
