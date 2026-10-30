'use client'
import { useEffect, useRef, useState } from 'react'
import type { Card, Message } from '@/lib/domain/types'
import { CardView } from './cards/Cards'
import { Composer } from './Composer'
import { SwipeToReply } from './SwipeToReply'

const STYLIST_FAILED = 'Couldn’t reach your stylist. Try again.'
const EXAMPLES = ['Drinks after work', 'A good fall themed outfit', 'Pack for Chicago Thursday to Sunday']

/** One line for a quoted message: its text, else what its card shows. */
function quoteLine(m: Message): string {
  if (m.text) return m.text
  const c: Card | undefined = m.cards[0]
  if (c?.kind === 'outfit') return `Look: ${c.pieces.map((p) => p.name).join(', ')}`
  if (c?.kind === 'listings') return `${c.products.length} store listings`
  if (c?.kind === 'pieces') return c.pieces.map((p) => p.name).join(', ')
  if (c?.kind === 'trip') return `Trip to ${c.destination}`
  return m.imageUrl ? 'Photo' : 'Message'
}
/** The quote bar names the look's pieces, so the owner sees which look they're answering */
const quoteFor = (m: Message) => (m.cards[0]?.kind === 'outfit' && m.text ? `${m.text} — ${quoteLine({ ...m, text: '' })}` : quoteLine(m))

export function Thread({ initial }: { initial: Message[] }) {
  const [messages, setMessages] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ text: string; image?: Blob; replyTo: string | null } | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [lit, setLit] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [messages.length, busy])

  async function send(text: string, opts: { image?: Blob; replyTo?: string | null } = {}) {
    if ((!text.trim() && !opts.image) || busy) return
    const quoted = opts.replyTo !== undefined ? opts.replyTo : replyTo?.id ?? null
    const form = new FormData()
    form.append('text', text.trim())
    if (quoted) form.append('replyTo', quoted)
    if (opts.image) form.append('image', opts.image, 'photo.jpg')
    const pending: Message = { id: `pending-${Date.now()}`, userId: '', role: 'user', text: text.trim(), cards: [], channel: 'web', replyTo: quoted, waIds: [],
      imageUrl: opts.image ? URL.createObjectURL(opts.image) : null, createdAt: new Date().toISOString() }
    setMessages((ms) => [...ms, pending]); setReplyTo(null); setFailed(null); setBusy(true)
    const res = await fetch('/api/thread', { method: 'POST', body: form }).catch(() => null)
    const j = (await res?.json().catch(() => null)) as { user?: Message; reply?: Message } | null
    setBusy(false)
    if (!res?.ok || !j?.reply) {
      setMessages((ms) => ms.map((m) => (m.id === pending.id && j?.user ? j.user : m)))
      return setFailed({ text, image: opts.image, replyTo: quoted })
    }
    setMessages((ms) => [...ms.filter((m) => m.id !== pending.id), j.user!, j.reply!])
  }

  const byId = new Map(messages.map((m) => [m.id, m]))
  const jump = (id: string) => {
    document.getElementById(`m-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setLit(id); setTimeout(() => setLit((x) => (x === id ? null : x)), 1500)
  }

  return (
    <>
      <p className="label text-ink-muted">Stylist</p>
      {!messages.length && (
        <div className="mt-2">
          <h1 className="display text-3xl">What’s on today?</h1>
          <p className="mt-2 text-ink-muted">Text me like a friend who’s good with clothes. Send a photo of a look to match it.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {EXAMPLES.map((t) => (
              <button key={t} type="button" onClick={() => send(t)} className="min-h-11 rounded-control border border-rule px-4 text-sm">{t}</button>
            ))}
          </div>
        </div>
      )}
      <ol aria-label="Conversation" className="mt-4 flex flex-col gap-6">
        {messages.map((m) => {
          const q = m.replyTo ? byId.get(m.replyTo) : null
          const mine = m.role === 'user'
          return (
            <li key={m.id} id={`m-${m.id}`} className={`rounded-sm transition-colors duration-500 ${lit === m.id ? 'bg-studio' : ''}`}>
              <SwipeToReply onReply={() => setReplyTo(m)} className={mine ? 'ml-auto max-w-[85%]' : ''}>
                <div className={mine ? 'flex flex-col items-end text-right' : ''}>
                  {m.replyTo && (
                    <button type="button" onClick={() => q && jump(q.id)} aria-label={`Quoted: ${q ? quoteFor(q) : 'an earlier message'}`}
                      className="mb-1 line-clamp-1 max-w-full border-l-2 border-rule pl-2 text-left text-xs text-ink-muted">
                      {q ? quoteFor(q) : 'An earlier message'}
                    </button>
                  )}
                  {m.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="Your photo" className="mb-2 max-h-56 w-auto rounded-sm object-contain" />
                  )}
                  {m.text && <p className={mine ? 'text-ink-muted' : ''}>{m.text}</p>}
                  {m.channel === 'whatsapp' && <p className="label mt-1 text-ink-muted">via WhatsApp</p>}
                </div>
                {m.cards.map((c, i) => (
                  <CardView key={i} card={c} busy={busy} say={(text, o) => send(text, { replyTo: o?.replyTo ? m.id : null })} />
                ))}
              </SwipeToReply>
            </li>
          )
        })}
        {busy && <li className="text-sm text-ink-muted" aria-live="polite">Thinking it through…</li>}
      </ol>
      {failed && (
        <div role="alert" className="mt-4 flex items-center gap-3 text-sm text-error">
          {STYLIST_FAILED}
          <button type="button" className="min-h-11 underline underline-offset-[3px]" onClick={() => send(failed.text, { image: failed.image, replyTo: failed.replyTo })}>Retry</button>
        </div>
      )}
      <div ref={end} className="h-40" />
      <Composer busy={busy} replyTo={replyTo ? quoteFor(replyTo) : null} onCancelReply={() => setReplyTo(null)} onSend={(text, image) => send(text, { image })} />
    </>
  )
}
