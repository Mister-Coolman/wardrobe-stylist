'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'

/** Link by sending a code from WhatsApp, so the app never needs a phone number. */
export function WhatsappLink({ linked: initiallyLinked }: { linked: boolean }) {
  const [linked, setLinked] = useState(initiallyLinked)
  const [code, setCode] = useState<{ code: string; number: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function call(method: 'POST' | 'DELETE') {
    setBusy(true); setError(null)
    const res = await fetch('/api/whatsapp/link', { method }).catch(() => null)
    setBusy(false)
    if (!res?.ok) return setError('Couldn’t do that. Try again.')
    if (method === 'DELETE') { setLinked(false); setCode(null) } else setCode(await res.json())
  }

  if (linked) return (
    <div className="flex items-center justify-between">
      <p>Linked. Text your stylist anytime.</p>
      <Button variant="tertiary" loading={busy} onClick={() => call('DELETE')}>Unlink</Button>
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      {code ? (
        <>
          <p className="display text-3xl tnum" aria-label={`Code ${code.code.split('').join(' ')}`}>{code.code}</p>
          <p className="text-sm text-ink-muted">Send this code to {code.number ?? 'the stylist’s number'} on WhatsApp within 10 minutes. Then reload this page.</p>
        </>
      ) : <p className="text-sm text-ink-muted">Same conversation, from WhatsApp: looks, swaps and photos.</p>}
      <Button variant="secondary" className="self-start" loading={busy} onClick={() => call('POST')}>{code ? 'New code' : 'Get a code'}</Button>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </div>
  )
}
