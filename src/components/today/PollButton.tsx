'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface PollState { slug: string; url: string; winner: string | null; score: string; total: number; winnerLook: number | null }

/** Stretch: "Which look?" — share a link, friends vote, the winner can become today's look. */
export function PollButton({ date, currentOutfitId, onWear }: { date: string; currentOutfitId: string; onWear: (outfitId: string) => void }) {
  const [poll, setPoll] = useState<PollState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/polls?date=${date}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.poll) return
      setPoll({ slug: j.poll.slug, url: `${location.origin}/p/${j.poll.slug}`, winner: j.result.winner, score: j.result.score, total: j.result.total,
        winnerLook: j.result.winner ? j.lookNumber[j.result.winner] ?? null : null })
    }).catch(() => {})
  }, [date])

  async function ask() {
    setBusy(true); setError(null)
    const res = await fetch('/api/polls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) }).catch(() => null)
    setBusy(false)
    if (!res?.ok) return setError('Couldn’t start a poll. Try again.')
    const { slug, url } = await res.json()
    setPoll({ slug, url, winner: null, score: '', total: 0, winnerLook: null })
    if (navigator.share) navigator.share({ title: 'Which look?', text: 'Help me pick today’s outfit', url }).catch(() => {})
  }

  const look = (n: number | null) => `Look ${String(n ?? 0).padStart(2, '0')}`
  return (
    <section aria-label="Ask friends" className="mt-10 border-t border-rule pt-6">
      {!poll ? (
        <>
          <Button variant="secondary" loading={busy} onClick={ask}>Ask friends which look</Button>
          {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
        </>
      ) : (
        <>
          {poll.winner ? (
            <p>Friends picked {look(poll.winnerLook)}, <span className="tnum">{poll.score}</span>.</p>
          ) : (
            <p className="text-ink-muted">{poll.total ? `Tied so far, ${poll.score}.` : 'No votes yet.'} Share the link:</p>
          )}
          {poll.winner && poll.winner !== currentOutfitId && (
            <Button variant="secondary" className="mt-3" onClick={() => onWear(poll.winner!)}>Wear {look(poll.winnerLook)}</Button>
          )}
          <div className="mt-3 flex items-center gap-4">
            <span data-testid="poll-link" className="min-w-0 truncate text-sm text-ink-muted">{poll.url}</span>
            <button type="button" className="min-h-11 shrink-0 underline underline-offset-[3px]"
              onClick={() => navigator.clipboard?.writeText(poll.url).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
        </>
      )}
    </section>
  )
}
