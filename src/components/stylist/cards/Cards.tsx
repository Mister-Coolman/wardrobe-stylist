'use client'
import Link from 'next/link'
import type { Card } from '@/lib/domain/types'

/** Card buttons send an ordinary message, so every action can also be typed, or sent from WhatsApp. */
export type Say = (text: string, opts?: { replyTo?: boolean }) => void

export function CardView({ card, say, busy }: { card: Card; say: Say; busy: boolean }) {
  switch (card.kind) {
    case 'outfit': return <OutfitCard card={card} say={say} busy={busy} />
    case 'pieces': return (
      <div role="group" aria-label="Pieces" className="mt-3 grid grid-cols-3 gap-3">
        {card.pieces.map((p) => (
          <div key={p.id}>
            <div className="aspect-square bg-studio p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.cutoutUrl} alt="" className="h-full w-full object-contain" />
            </div>
            <p className="mt-1 text-sm leading-tight">{p.name}</p>
            <p className="text-xs text-ink-muted">{p.status === 'laundry' ? 'In the laundry' : p.status === 'worn' ? 'Worn' : 'Clean'}</p>
          </div>
        ))}
      </div>
    )
    case 'listings': return (
      <ul role="group" aria-label="Store listings" className="mt-3 grid grid-cols-2 gap-x-3 gap-y-5">
        {card.products.map((p, i) => (
          <li key={p.id}>
            <button type="button" disabled={busy} onClick={() => say(`Add ${i + 1}`, { replyTo: true })}
              aria-label={`Add ${p.title}${p.store ? `, ${p.store}` : ''}${p.price ? `, ${p.price}` : ''}`}
              className="press block w-full text-left disabled:opacity-60">
              <div className="relative aspect-square bg-studio p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" referrerPolicy="no-referrer" />
                <span className="label absolute left-2 top-2 text-ink-muted">{i + 1}</span>
              </div>
              <div className="mt-2 line-clamp-2 text-sm font-medium leading-tight">{p.title}</div>
              <div className="mt-1 text-xs text-ink-muted tnum">{[p.store, p.price].filter(Boolean).join(' · ')}</div>
            </button>
          </li>
        ))}
      </ul>
    )
    case 'trip': return (
      <Link href={`/trips/${card.tripId}`} className="mt-3 flex min-h-11 items-center justify-between border-y border-rule py-3">
        <span><span className="font-medium">{card.destination}</span> <span className="text-ink-muted">· {card.days} days</span></span>
        <span className="underline underline-offset-[3px]">Packing list</span>
      </Link>
    )
    case 'added': return (
      <Link href="/closet" className="mt-2 inline-flex min-h-11 items-center underline underline-offset-[3px]">See it in your closet</Link>
    )
  }
}

function OutfitCard({ card, say, busy }: { card: Extract<Card, { kind: 'outfit' }>; say: Say; busy: boolean }) {
  return (
    <div role="group" aria-label={`Look: ${card.pieces.map((p) => p.name).join(', ')}`} className="mt-3">
      {card.imageUrl ? (
        <div className="aspect-[4/5] bg-studio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-px bg-paper">
          {card.pieces.map((p) => (
            <div key={p.id} className="aspect-square bg-studio p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.cutoutUrl} alt="" className="h-full w-full object-contain" />
            </div>
          ))}
        </div>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink-muted">
        {card.pieces.map((p) => <li key={p.id}>{p.name}</li>)}
      </ul>
      <div className="mt-1 flex flex-wrap gap-x-5">
        {(['Another look', 'Swap a piece', 'Wore it'] as const).map((t) => (
          <button key={t} type="button" disabled={busy} onClick={() => say(t, { replyTo: t !== 'Another look' })}
            className="min-h-11 text-sm font-medium underline underline-offset-[3px] disabled:opacity-50">{t}</button>
        ))}
      </div>
    </div>
  )
}
