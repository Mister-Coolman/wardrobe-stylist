'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Garment } from '@/lib/domain/types'
import type { TodayPlan } from '@/lib/today'
import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Tag'
import { AnythingElse } from './AnythingElse'
import { DayStrip } from './DayStrip'
import { FittingNotes } from './FittingNotes'
import { LookHero } from './LookHero'
import { MissingPieces } from './MissingPieces'
import { PieceList } from './PieceList'

const STEPS = ['Checking the forecast…', 'Reading your calendar…', 'Picking pieces…', 'Laying it out…']
type Manual = 'warm' | 'mild' | 'cold'

function headerDate(date: string, plan: TodayPlan | null) {
  const d = new Date(`${date}T12:00:00Z`)
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const w = plan?.day.weather
  return w && w.summary !== 'unknown' ? `${day} · ${w.tempHighC}°` : day
}

export function TodayView({ wardrobe }: { wardrobe: Garment[] }) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [busy, setBusy] = useState<'load' | 'another' | 'event' | null>('load')
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState<Manual | undefined>()
  const [worn, setWorn] = useState<'idle' | 'busy' | 'done'>('idle')
  const [askDone, setAskDone] = useState(false)

  const call = useCallback(async (kind: 'load' | 'another' | 'event', init?: RequestInit & { path?: string }) => {
    setBusy(kind); setError(null); setStep(0)
    try {
      const res = await fetch(init?.path ?? '/api/today', init)
      if (!res.ok) throw new Error()
      setPlan(await res.json())
      setWorn('idle')
    } catch {
      setError(kind === 'event' ? 'Couldn’t add that. Try again.' : 'Couldn’t put a look together just now. Try again.')
    } finally { setBusy(null) }
  }, [])

  useEffect(() => { void call('load') }, [call])
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900)
    return () => clearInterval(t)
  }, [busy])

  const json = (body: object): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const date = plan?.day.date

  if (!plan) {
    return (
      <div aria-live="polite">
        <div className="h-3 w-40 bg-studio" />
        <div className="mt-4 h-9 w-3/4 bg-studio" />
        <div className="-mx-5 mt-6 aspect-[4/5] bg-studio" />
        <p className="mt-4 text-sm text-ink-muted">{error ?? STEPS[step]}</p>
        {error && <Button variant="secondary" className="mt-4" onClick={() => call('load')}>Try again</Button>}
      </div>
    )
  }

  const r = plan.result
  return (
    <>
      <p className="label text-ink-muted">{headerDate(plan.day.date, plan)}</p>
      <DayStrip day={plan.day} calendarConnected={plan.calendarConnected} />
      {plan.day.weather.summary === 'unknown' && (
        <div className="mt-4">
          <p className="text-sm">Couldn’t get the forecast. What’s it like out?</p>
          <div className="mt-2 flex gap-2">
            {(['warm', 'mild', 'cold'] as Manual[]).map((m) => (
              <Tag key={m} selected={manual === m} onClick={() => { setManual(m); void call('another', { ...json({ date, weather: m }) }) }}>
                {m[0].toUpperCase() + m.slice(1)}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {!r.ok ? (
        <MissingPieces missing={r.missing} closetEmpty={!wardrobe.length} />
      ) : (
        <>
          <h1 className="display mt-6 text-3xl">Look {String(r.lookNumber).padStart(2, '0')} — {r.outfit.title}</h1>
          {plan.day.changeSuggestion && <p className="mt-2 text-sm text-warn">{plan.day.changeSuggestion}</p>}
          <div className={`mt-6 ${busy && busy !== 'load' ? 'opacity-50' : ''}`}>
            <LookHero mode={r.outfit.renderMode} url={r.outfit.renderUrl} pieces={r.pieces} />
          </div>
          {busy && <p aria-live="polite" className="mt-3 text-sm text-ink-muted">{STEPS[step]}</p>}
          {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}

          <div className="mt-6 flex items-center gap-3 pr-[72px]">
            <Button className="flex-1" loading={worn === 'busy'} disabled={worn === 'done' || !!busy}
              onClick={async () => {
                setWorn('busy')
                const res = await fetch('/api/wear', json({ outfitId: r.outfit.id }))
                setWorn(res.ok ? 'done' : 'idle')
                if (!res.ok) setError('Couldn’t log that. Try again.')
              }}>
              {worn === 'done' ? 'Logged — enjoy the day' : 'I wore this'}
            </Button>
          </div>
          <Button variant="secondary" className="mt-3" loading={busy === 'another'} disabled={!!busy}
            onClick={() => call('another', json({ date, weather: manual }))}>Another look</Button>

          <PieceList outfit={r.outfit} pieces={r.pieces} />
          <FittingNotes outfit={r.outfit} pieces={r.pieces} wardrobe={wardrobe} bestEffort={r.bestEffort} />
          {!askDone && (
            <AnythingElse busy={!!busy}
              added={plan.day.events.filter((e) => e.source === 'user').map((e) => e.title)}
              onAdd={(title) => call('event', { ...json({ title, date, weather: manual }), path: '/api/events' })}
              onDismiss={() => setAskDone(true)} />
          )}
        </>
      )}
    </>
  )
}
