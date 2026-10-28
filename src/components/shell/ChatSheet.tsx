'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Microphone } from '@phosphor-icons/react'
import { Sheet } from '@/components/ui/Sheet'
import { toWav } from './toWav'

interface Line { role: 'user' | 'assistant'; content: string; outfitId?: string; tripId?: string }

export function ChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [lines, setLines] = useState<Line[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'send' | 'listen' | 'transcribe' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)

  async function send(content: string) {
    if (!content.trim()) return
    const next: Line[] = [...lines, { role: 'user', content: content.trim() }]
    setLines(next); setText(''); setBusy('send'); setError(null)
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }) })
      if (!res.ok) throw new Error()
      const r = (await res.json()) as { reply: string; outfitId?: string; tripId?: string }
      setLines([...next, { role: 'assistant', content: r.reply, outfitId: r.outfitId, tripId: r.tripId }])
      if (r.outfitId) { window.dispatchEvent(new Event('outfit-planned')); router.refresh() }
    } catch {
      setError('Couldn’t reach your stylist. Try again.')
    } finally { setBusy(null) }
  }

  async function startListening() {
    if (busy) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setBusy('transcribe')
        const form = new FormData()
        const wav = await toWav(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })).catch(() => null)
        if (!wav) { setBusy(null); return setError('Didn’t catch that. Try again or type it.') }
        form.append('audio', wav, 'voice.wav')
        const res = await fetch('/api/transcribe', { method: 'POST', body: form }).catch(() => null)
        setBusy(null)
        if (!res?.ok) return setError('Didn’t catch that. Try again or type it.')
        const { text: heard } = (await res.json()) as { text: string }
        void send(heard)
      }
      rec.current = mr
      mr.start()
      setBusy('listen')
    } catch {
      setError('Microphone isn’t available — type it instead.')
    }
  }
  const stopListening = () => { if (rec.current?.state === 'recording') rec.current.stop() }

  return (
    <Sheet open={open} onClose={onClose} label="Your stylist">
      <h2 className="display text-2xl">What’s on today?</h2>
      <p className="mt-1 text-sm text-ink-muted">“Drinks after work”, “pack for Chicago Thursday to Sunday”, “something warmer”.</p>
      <ol aria-label="Conversation" aria-live="polite" className="mt-6 flex flex-col gap-4">
        {lines.map((l, i) => (
          <li key={i} className={l.role === 'user' ? 'self-end max-w-[85%] text-right text-ink-muted' : 'max-w-[90%]'}>
            <p>{l.content}</p>
            {l.outfitId && <Link href="/today" onClick={onClose} className="mt-1 inline-flex min-h-11 items-center underline underline-offset-[3px]">See the look</Link>}
            {l.tripId && <Link href={`/trips/${l.tripId}`} onClick={onClose} className="mt-1 inline-flex min-h-11 items-center underline underline-offset-[3px]">Open the packing list</Link>}
          </li>
        ))}
        {busy === 'send' && <li className="text-sm text-ink-muted">Thinking it through…</li>}
        {busy === 'transcribe' && <li className="text-sm text-ink-muted">Listening back…</li>}
      </ol>
      {error && <p role="alert" className="mt-4 text-sm text-error">{error}</p>}
      <form className="mt-6 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(text) }}>
        <label className="field flex-1">
          <span className="sr-only">Message</span>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or hold the mic" maxLength={500} disabled={busy === 'listen'} />
        </label>
        <button type="button" aria-label={busy === 'listen' ? 'Release to send' : 'Hold to talk'} aria-pressed={busy === 'listen'}
          onPointerDown={startListening} onPointerUp={stopListening} onPointerLeave={stopListening} onContextMenu={(e) => e.preventDefault()}
          className={`press flex h-11 w-11 items-center justify-center rounded-mic border ${busy === 'listen' ? 'border-accent bg-accent text-paper' : 'border-ink text-ink'}`}>
          <Microphone size={20} weight="light" aria-hidden />
        </button>
        <button type="submit" disabled={!text.trim() || !!busy} className="press h-11 rounded-control border border-ink px-4 font-semibold disabled:opacity-50">Send</button>
      </form>
    </Sheet>
  )
}
