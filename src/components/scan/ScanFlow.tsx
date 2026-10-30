'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { Garment, ScanJob } from '@/lib/domain/types'
import { FORMALITY, plural } from '@/lib/ui/format'
import { Button } from '@/components/ui/Button'
import { GarmentEditor } from '@/components/closet/GarmentEditor'
import { GarmentTile } from '@/components/closet/GarmentTile'
import { isStalled, thinToBudget, UPLOAD_BUDGET } from '@/lib/ui/scanUpload'
import { ShopSearch } from '@/components/shop/ShopSearch'
import type { Product } from '@/lib/shop/search'
import { FPS, samplePhoto, sampleVideo } from './FrameSampler'

export type Mode = 'sweep' | 'holdup' | 'photo' | 'web'
/** Each tip fixes a failure measured on real closet clips (docs/notes/sam-check.md): an arm or a neighbour across
 *  the piece splits it in two, a piece filling the frame is dropped, movement blurs it, dim light muddies it. */
const MODES: { id: Mode; label: string; hint: string; tips: string[] }[] = [
  { id: 'holdup', label: 'Hold-up', hint: 'Cleanest cutouts. Show one piece at a time against a door or wall.', tips: [
    'Hold it up by the hanger at arm’s length, so your hand stays off the fabric.',
    'Get the whole piece in frame with some wall around it — not right up to the camera.',
    'Hold still for a second or two, then move it out of frame before the next one.',
    'A plain wall in even light works best. Show dark clothes against a light wall.',
    'About 10 pieces per recording; record again for the next 10.',
  ] },
  { id: 'sweep', label: 'Flip through', hint: 'Quicker, rougher cutouts. Film one rail or shelf at a time, right where it hangs.', tips: [
    'Pull each piece forward, clear of its neighbours, so it fills most of the screen.',
    'Keep your arm to the side — anything across the piece cuts it in two.',
    'Hold for a second, then push it back and pull the next one.',
    'Turn on every light you can; a dim rail gives muddy cutouts.',
  ] },
  { id: 'photo', label: 'Photo', hint: 'One photo of a few pieces laid flat or hung apart. Quickest way to try it.', tips: [] },
  { id: 'web', label: 'Online', hint: 'Know exactly what you own? Search the stores for it and pick the listing. Works away from home.', tips: [] },
]
type Phase = { kind: 'pick' } | { kind: 'preparing'; done: number; total: number } | { kind: 'uploading' }
  | { kind: 'scanning'; job: ScanJob | null } | { kind: 'review'; garments: Garment[] } | { kind: 'error'; message: string }

export function ScanFlow({ initialMode = 'holdup' }: { initialMode?: Mode }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [editing, setEditing] = useState<Garment | null>(null)
  // stepping: "Review one by one" moves to the next piece after each save or delete; a tapped piece just closes
  const [stepping, setStepping] = useState(false)
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const jobId = useRef<string | null>(null)
  const lastChange = useRef<{ key: string; since: number }>({ key: '', since: 0 })

  async function start(file: File) {
    try {
      let frames: Blob[]
      if (mode === 'photo') frames = [await samplePhoto(file)]
      else { setPhase({ kind: 'preparing', done: 0, total: 1 }); frames = await sampleVideo(file, (done, total) => setPhase({ kind: 'preparing', done, total })) }
      setPhase({ kind: 'uploading' })
      // frames only (the video stays on the phone), thinned to fit one request
      const form = new FormData()
      thinToBudget(frames.map((f) => f.size), UPLOAD_BUDGET).forEach((i) => form.append('frames', frames[i], `frame-${Math.round((i * 1000) / FPS)}ms.jpg`))
      const res = await fetch('/api/scan', { method: 'POST', body: form })
      if (!res.ok) throw new Error('Upload failed — check your connection and try again.')
      jobId.current = (await res.json()).id
      lastChange.current = { key: 'start', since: Date.now() }
      setPhase({ kind: 'scanning', job: null })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Something went wrong. Try again.' })
    }
  }

  /** A store listing goes through the same scan as a photo; the server fetches its picture. */
  async function addListing(p: Product) {
    setPicking(p.id)
    const res = await fetch('/api/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageUrl: p.imageUrl, title: p.title }) }).catch(() => null)
    setPicking(null)
    if (!res?.ok) return setPhase({ kind: 'error', message: 'Couldn’t get that listing’s photo. Try another one.' })
    jobId.current = (await res.json()).id
    lastChange.current = { key: 'start', since: Date.now() }
    setPhase({ kind: 'scanning', job: null })
  }

  useEffect(() => {
    if (phase.kind !== 'scanning') return
    const t = setTimeout(async () => {
      const res = await fetch(`/api/scan/${jobId.current}`).catch(() => null)
      if (!res?.ok) return setPhase({ kind: 'scanning', job: phase.job })
      const { job, garments } = (await res.json()) as { job: ScanJob; garments: Garment[] }
      if (job.status === 'review') setPhase({ kind: 'review', garments })
      else if (job.status === 'failed') setPhase({ kind: 'error', message: job.error ?? 'The scan failed. Try again.' })
      else {
        const key = `${job.status}:${job.progress}`
        if (key !== lastChange.current.key) lastChange.current = { key, since: Date.now() }
        if (isStalled(lastChange.current, key, Date.now())) setPhase({ kind: 'error', message: 'The scan stopped partway — try again, or take a single photo.' })
        else setPhase({ kind: 'scanning', job })
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [phase])

  async function addAll(garments: Garment[]) {
    setAdding(true)
    const res = await fetch('/api/garments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmIds: garments.map((g) => g.id) }) })
    if (!res.ok) { setAdding(false); return setPhase({ kind: 'error', message: 'Couldn’t add those pieces. Try again.' }) }
    router.push('/closet')
    router.refresh()
  }

  if (phase.kind === 'review') {
    const gs = phase.garments
    const next = (list: Garment[], afterId: string) => { const i = gs.findIndex((g) => g.id === afterId); return list.find((g, j) => j >= i && g.id !== afterId) ?? null }
    return (
      <>
        <p className="label text-ink-muted">Closet scan</p>
        <h1 className="display mt-2 text-3xl">{gs.length ? `Found ${plural(gs.length, 'piece')}` : 'All sorted'}</h1>
        <p className="mt-2 text-ink-muted">Nothing is used until you add it. Tap a piece to fix its name or details.</p>
        <p role="status" className="mt-2 min-h-5 text-sm text-ink-muted">{notice}</p>
        <ul className="mt-6 grid grid-cols-3 gap-x-3 gap-y-6">
          {gs.map((g, i) => <li key={g.id}><GarmentTile garment={g} meta={FORMALITY[g.formality]} index={i} settle onOpen={() => { setStepping(false); setEditing(g) }} /></li>)}
        </ul>
        <div className="sticky bottom-[calc(80px+env(safe-area-inset-bottom))] mt-8 flex flex-col items-stretch gap-2 bg-paper pt-3">
          {gs.length ? (
            <>
              <Button className="w-[calc(100%-72px)]" loading={adding} onClick={() => addAll(gs)}>{adding ? 'Adding…' : `Add ${plural(gs.length, 'piece')}`}</Button>
              <Button variant="tertiary" className="self-start" onClick={() => { setStepping(true); setEditing(gs[0]) }}>Review one by one</Button>
            </>
          ) : <Button className="w-[calc(100%-72px)]" onClick={() => { router.push('/closet'); router.refresh() }}>Go to closet</Button>}
        </div>
        <GarmentEditor reviewing garment={editing} onClose={() => setEditing(null)}
          onSaved={(g) => { const rest = gs.filter((x) => x.id !== g.id); setPhase({ kind: 'review', garments: rest }); setNotice(`Kept ${g.name}`); setEditing(stepping ? next(rest, g.id) : null) }}
          onDeleted={(id) => {
            const rest = gs.filter((x) => x.id !== id)
            setPhase({ kind: 'review', garments: rest }); setNotice(`Deleted ${gs.find((x) => x.id === id)?.name ?? 'that piece'}`); setEditing(stepping ? next(rest, id) : null)
          }} />
      </>
    )
  }

  const busy = phase.kind === 'preparing' || phase.kind === 'uploading' || phase.kind === 'scanning'
  const job = phase.kind === 'scanning' ? phase.job : null
  const line =
    phase.kind === 'preparing' ? `Reading the video… ${phase.done}/${phase.total}` :
    phase.kind === 'uploading' ? 'Uploading…' :
    !job || job.status === 'queued' ? 'Starting the scan…' :
    job.status === 'segmenting' ? 'Looking for clothes…' :
    `Found ${job.foundCount} · tagging ${Math.min(job.foundCount, Math.round(job.progress * job.foundCount) + 1)}/${job.foundCount}…`
  const current = MODES.find((m) => m.id === mode)!

  return (
    <>
      <p className="label text-ink-muted">Closet scan</p>
      <h1 className="display mt-2 text-3xl">{mode === 'web' ? 'Add it from the web.' : 'Film your closet once.'}</h1>
      <div role="tablist" aria-label="Capture mode" className="mt-6 flex border-b border-rule">
        {MODES.map((m) => (
          <button key={m.id} role="tab" aria-selected={mode === m.id} disabled={busy} onClick={() => setMode(m.id)}
            className={`min-h-11 flex-1 border-b-2 text-base ${mode === m.id ? 'border-ink font-semibold' : 'border-transparent text-ink-muted'}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-4 max-w-[48ch] text-ink-muted">{current.hint}</p>
      {current.tips.length > 0 && !busy && (
        <ol aria-label="How to record" className="mt-4 flex max-w-[48ch] flex-col gap-2 text-sm">
          {current.tips.map((t, i) => (
            <li key={t} className="flex gap-3"><span aria-hidden className="tnum text-ink-muted">{i + 1}</span><span>{t}</span></li>
          ))}
        </ol>
      )}

      {busy ? (
        <div className="mt-10" aria-live="polite">
          <div className="h-px w-full bg-rule"><div className="h-px bg-ink transition-[width] duration-200" style={{ width: `${job ? Math.round(job.progress * 100) : 8}%` }} /></div>
          <p className="mt-3 text-sm text-ink-muted tnum">{line}</p>
          <ul className="mt-6 grid grid-cols-3 gap-3" aria-hidden>
            {Array.from({ length: Math.max(3, job?.foundCount ?? 3) }, (_, i) => <li key={i} className="aspect-square bg-studio opacity-60" />)}
          </ul>
        </div>
      ) : mode === 'web' ? (
        <div className="mt-8 flex flex-col gap-3">
          {phase.kind === 'error' && <p role="alert" className="text-error">{phase.message}</p>}
          <ShopSearch picking={picking} onPick={addListing} />
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-3">
          {phase.kind === 'error' && <p role="alert" className="text-error">{phase.message}</p>}
          <label className="press inline-flex h-12 w-[calc(100%-72px)] cursor-pointer items-center justify-center rounded-control bg-accent font-semibold text-paper focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            {mode === 'photo' ? 'Take a photo' : 'Record a section'}
            <input type="file" className="sr-only" aria-label={mode === 'photo' ? 'Closet photo' : 'Closet video'}
              accept={mode === 'photo' ? 'image/*' : 'video/*'} capture="environment"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) start(f) }} />
          </label>
          <p className="text-sm text-ink-muted">Pieces come back as cutouts for you to check. Only still frames are uploaded; the video stays on your phone.</p>
        </div>
      )}
    </>
  )
}
