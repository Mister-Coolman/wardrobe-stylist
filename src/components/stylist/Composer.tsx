'use client'
import { useRef, useState } from 'react'
import { Camera, Microphone, X } from '@phosphor-icons/react'
import { toWav } from '@/components/shell/toWav'
import { samplePhoto } from '@/components/scan/FrameSampler'

/** Text, hold-to-talk and a photo, pinned above the tab bar. replyTo: the quoted message's line while replying. */
export function Composer({ busy, replyTo, onCancelReply, onSend }: {
  busy: boolean; replyTo: string | null; onCancelReply: () => void; onSend: (text: string, image?: Blob) => void
}) {
  const [text, setText] = useState('')
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [mic, setMic] = useState<'idle' | 'listen' | 'transcribe'>('idle')
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<MediaRecorder | null>(null)

  function submit(t = text) {
    if (busy || (!t.trim() && !image)) return
    onSend(t, image?.blob)
    setText(''); setImage(null)
  }

  async function startListening() {
    if (busy || mic !== 'idle') return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = (e) => chunks.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        setMic('transcribe')
        const wav = await toWav(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })).catch(() => null)
        const form = new FormData()
        if (wav) form.append('audio', wav, 'voice.wav')
        const res = wav ? await fetch('/api/transcribe', { method: 'POST', body: form }).catch(() => null) : null
        setMic('idle')
        if (!res?.ok) return setError('Didn’t catch that. Try again or type it.')
        submit(((await res.json()) as { text: string }).text)
      }
      rec.current = mr
      mr.start()
      setMic('listen')
    } catch {
      setError('Microphone isn’t available — type it instead.')
    }
  }
  const stopListening = () => { if (rec.current?.state === 'recording') rec.current.stop() }

  return (
    <div className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-20 border-t border-rule bg-paper">
      <div className="mx-auto max-w-[560px] px-5 py-3">
        {replyTo && (
          <section aria-label="Replying to" className="mb-2 flex items-center gap-2 border-l-2 border-accent pl-2 text-sm">
            <span className="line-clamp-1 flex-1 text-ink-muted">{replyTo}</span>
            <button type="button" aria-label="Cancel reply" onClick={onCancelReply} className="flex h-11 w-11 items-center justify-center text-ink-muted"><X size={18} aria-hidden /></button>
          </section>
        )}
        {image && (
          <div className="mb-2 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt="Photo to send" className="h-14 w-14 object-cover" />
            <button type="button" onClick={() => setImage(null)} className="min-h-11 text-sm underline underline-offset-[3px]">Remove photo</button>
          </div>
        )}
        {error && <p role="alert" className="mb-2 text-sm text-error">{error}</p>}
        {mic !== 'idle' && <p className="mb-2 text-sm text-ink-muted" aria-live="polite">{mic === 'listen' ? 'Listening… release to send' : 'Listening back…'}</p>}
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
          <label className="press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-control border border-rule text-ink focus-within:outline-2 focus-within:outline-accent">
            <Camera size={20} weight="light" aria-hidden />
            <input type="file" accept="image/*" className="sr-only" aria-label="Add a photo" disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = ''
                if (!f) return
                const blob = await samplePhoto(f).catch(() => null)
                if (!blob) return setError('Couldn’t read that photo.')
                setImage({ blob, url: URL.createObjectURL(blob) })
              }} />
          </label>
          <label className="field min-w-0 flex-1">
            <span className="sr-only">Message</span>
            <input className="input w-full min-w-0" value={text} onChange={(e) => setText(e.target.value)} placeholder={image ? 'Add these? Match this look?' : 'Text your stylist'} maxLength={2000} disabled={mic === 'listen'} />
          </label>
          <button type="button" aria-label={mic === 'listen' ? 'Release to send' : 'Hold to talk'} aria-pressed={mic === 'listen'}
            onPointerDown={startListening} onPointerUp={stopListening} onPointerLeave={stopListening} onContextMenu={(e) => e.preventDefault()}
            className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-mic border ${mic === 'listen' ? 'border-accent bg-accent text-paper' : 'border-ink text-ink'}`}>
            <Microphone size={20} weight="light" aria-hidden />
          </button>
          <button type="submit" disabled={busy || (!text.trim() && !image)} className="press h-11 shrink-0 rounded-control border border-ink px-3 font-semibold disabled:opacity-50">Send</button>
        </form>
      </div>
    </div>
  )
}
