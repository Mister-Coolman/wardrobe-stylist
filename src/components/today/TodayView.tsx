'use client'
import { useCallback, useEffect, useState } from 'react'
import type { Garment, RenderMode, TempUnit } from '@/lib/domain/types'
import type { TodayPlan } from '@/lib/today'
import { applyRender } from '@/lib/ui/todayState'
import { Button } from '@/components/ui/Button'
import { Tag } from '@/components/ui/Tag'
import { AnythingElse } from './AnythingElse'
import { DayStrip } from './DayStrip'
import { FittingNotes } from './FittingNotes'
import { degrees, withUnit } from '@/lib/ui/temperature'
import { GapCard } from './GapCard'
import { LookHero } from './LookHero'
import { MissingPieces } from './MissingPieces'
import { PieceList } from './PieceList'
import { PollButton } from './PollButton'
import { RenderModePicker } from './RenderModePicker'

const STEPS = ['Checking the forecast…', 'Reading your calendar…', 'Picking pieces…', 'Laying it out…']
type Manual = 'warm' | 'mild' | 'cold'

function headerDate(date: string, plan: TodayPlan | null, unit: TempUnit) {
  const d = new Date(`${date}T12:00:00Z`)
  const day = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const w = plan?.day.weather
  return w && w.summary !== 'unknown' ? `${day} · ${degrees(w.tempHighC, unit)}` : day
}

export function TodayView({ wardrobe, unit }: { wardrobe: Garment[]; unit: TempUnit }) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [busy, setBusy] = useState<'load' | 'another' | 'event' | null>('load')
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState<Manual | undefined>()
  const [worn, setWorn] = useState<'idle' | 'busy' | 'done'>('idle')
  const [askDone, setAskDone] = useState(false)
  const [mode, setMode] = useState<RenderMode | null>(null)
  const [render, setRender] = useState<{ busy: boolean; note?: string; failed?: RenderMode }>({ busy: false })

  const call = useCallback(async (kind: 'load' | 'another' | 'event', init?: RequestInit & { path?: string }) => {
    setBusy(kind); setError(null); setStep(0)
    try {
      const res = await fetch(init?.path ?? '/api/today', init)
      if (!res.ok) throw new Error()
      const next = (await res.json()) as TodayPlan
      setPlan(next)
      if (next.result.ok) setMode(next.result.outfit.renderMode)
      setRender({ busy: false })
      setWorn(next.result.ok && next.result.worn ? 'done' : 'idle')
    } catch {
      setError(kind === 'event' ? 'Couldn’t add that. Try again.' : 'Couldn’t put a look together just now. Try again.')
    } finally { setBusy(null) }
  }, [])

  useEffect(() => { void call('load') }, [call])
  // the chat sheet plans outfits and adds events behind this screen's back
  useEffect(() => {
    const reload = () => void call('load')
    window.addEventListener('outfit-planned', reload)
    return () => window.removeEventListener('outfit-planned', reload)
  }, [call])
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900)
    return () => clearInterval(t)
  }, [busy])

  async function applyMode(m: RenderMode) {
    if (!plan?.result.ok) return
    const r = plan.result
    setMode(m)
    if (m === 'none') {
      setPlan({ ...plan, result: { ...r, outfit: { ...r.outfit, renderMode: 'none', renderUrl: null } } })
      setRender({ busy: false })
      void fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ renderMode: 'none' }) })
      return
    }
    setRender({ busy: true })
    const res = await fetch('/api/render', json({ outfitId: r.outfit.id, mode: m })).catch(() => null)
    const out = res?.ok ? await res.json() as { renderMode: RenderMode; renderUrl: string | null; note?: string; error?: string } : { renderMode: 'none' as const, renderUrl: null, error: 'render_failed' }
    let current = true
    setPlan((p) => { if (!p) return p; const next = applyRender(p, r.outfit.id, out); current = next !== p; return next })
    if (!current) return
    setMode(out.error ? m : out.renderMode)
    setRender({ busy: false, note: out.note, failed: out.error ? m : undefined })
  }

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
      <p className="label text-ink-muted">{headerDate(plan.day.date, plan, unit)}</p>
      <DayStrip day={plan.day} calendarConnected={plan.calendarConnected} unit={unit} />
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
          <div className="mt-4">
            <RenderModePicker value={mode ?? r.outfit.renderMode} disabled={!!busy || render.busy} onChange={applyMode} />
          </div>
          <div className={`mt-2 ${(busy && busy !== 'load') || render.busy ? 'opacity-50' : ''}`}>
            <LookHero mode={r.outfit.renderMode} url={r.outfit.renderUrl} pieces={r.pieces} />
          </div>
          {render.busy && <p aria-live="polite" className="mt-3 text-sm text-ink-muted">Laying it out…</p>}
          {render.note && <p className="mt-3 text-sm text-ink-muted">{withUnit(render.note, unit)}</p>}
          {render.failed && (
            <p role="alert" className="mt-3 text-sm">
              <span className="text-error">Couldn’t render the look. Showing the pieces instead.</span>{' '}
              <button type="button" className="min-h-11 underline underline-offset-[3px]" onClick={() => applyMode(render.failed!)}>Try again</button>
            </p>
          )}
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
          <Button variant="secondary" className="mt-3" loading={busy === 'another'} disabled={!!busy || render.busy}
            onClick={() => call('another', json({ date, weather: manual }))}>Another look</Button>

          <PieceList outfit={r.outfit} pieces={r.pieces} unit={unit} />
          <FittingNotes outfit={r.outfit} pieces={r.pieces} wardrobe={wardrobe} bestEffort={r.bestEffort} unit={unit} />
          {!askDone && (
            <AnythingElse busy={!!busy || render.busy}
              added={plan.day.events.filter((e) => e.source === 'user').map((e) => e.title)}
              onAdd={(title) => call('event', { ...json({ title, date, weather: manual }), path: '/api/events' })}
              onDismiss={() => setAskDone(true)} />
          )}
          {process.env.NEXT_PUBLIC_FEATURE_POLL === '1' && (
            <PollButton key={r.outfit.id} date={plan.day.date} currentOutfitId={r.outfit.id}
              onWear={(outfitId) => call('another', { ...json({ outfitId }), path: '/api/today/select' })} />
          )}
          <GapCard />
        </>
      )}
    </>
  )
}
