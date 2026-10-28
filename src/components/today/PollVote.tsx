'use client'
import { useState } from 'react'

interface Look { id: string; label: string; title: string; render: string | null; pieces: { name: string; url: string }[] }

export function PollVote({ slug, looks, alreadyVoted }: { slug: string; looks: Look[]; alreadyVoted: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'already' | 'error'>(alreadyVoted ? 'already' : 'idle')
  const [counts, setCounts] = useState<Record<string, number> | null>(null)

  async function vote(id: string) {
    setState('busy')
    const res = await fetch(`/api/polls/${slug}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outfitId: id }) }).catch(() => null)
    if (!res) return setState('error')
    const j = await res.json().catch(() => ({}))
    document.cookie = `voted_${slug}=1; path=/; max-age=31536000; samesite=lax`
    if (j.result) setCounts(j.result.counts)
    setState(res.status === 409 ? 'already' : res.ok ? 'done' : 'error')
  }

  return (
    <>
      {state === 'done' && <p role="status" className="mt-4">Thanks — your vote is in.</p>}
      {state === 'already' && <p role="status" className="mt-4 text-ink-muted">You’ve voted.</p>}
      {state === 'error' && <p role="alert" className="mt-4 text-error">That didn’t go through. Try again.</p>}
      <ul className="mt-8 flex flex-col gap-10">
        {looks.map((l) => (
          <li key={l.id}>
            <div className="flex items-baseline justify-between">
              <h2 className="display text-2xl">{l.label} — {l.title}</h2>
              {counts && <span className="text-sm text-ink-muted tnum">{counts[l.id] ?? 0} vote{(counts[l.id] ?? 0) === 1 ? '' : 's'}</span>}
            </div>
            {l.render ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={l.render} alt={`${l.label}: ${l.pieces.map((p) => p.name).join(', ')}`} className="-mx-5 mt-3 aspect-[4/5] w-[calc(100%+40px)] max-w-none bg-studio object-cover" />
            ) : (
              <ul className="-mx-5 mt-3 grid grid-cols-2 gap-px">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.pieces.map((p) => <li key={p.url} className="aspect-square bg-studio p-4"><img src={p.url} alt={p.name} className="h-full w-full object-contain" /></li>)}
              </ul>
            )}
            <p className="mt-2 text-sm text-ink-muted">{l.pieces.map((p) => p.name).join(' · ')}</p>
            {(state === 'idle' || state === 'busy' || state === 'error') && (
              <button type="button" disabled={state === 'busy'} onClick={() => vote(l.id)}
                className="press mt-3 h-12 w-full rounded-control border border-ink font-semibold disabled:opacity-50">Vote for {l.label}</button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
