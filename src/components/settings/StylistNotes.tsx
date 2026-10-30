'use client'
import { useState } from 'react'
import type { StylistNote } from '@/lib/domain/types'
import { Button } from '@/components/ui/Button'

/** What the stylist remembers: the same notes it saves when told "I like navy with olive". */
export function StylistNotes({ value, onSave }: { value: StylistNote[]; onSave: (notes: StylistNote[]) => Promise<void> }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (notes: StylistNote[]) => { setBusy(true); await onSave(notes); setBusy(false) }
  return (
    <div className="flex flex-col gap-3">
      {value.length ? (
        <ul aria-label="Saved preferences" className="flex flex-col divide-y divide-rule border-y border-rule">
          {value.map((n) => (
            <li key={n.id} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <span>{n.text}</span>
              <button type="button" disabled={busy} aria-label={`Remove “${n.text}”`} onClick={() => save(value.filter((x) => x.id !== n.id))}
                className="min-h-11 shrink-0 px-1 text-sm text-ink-muted underline underline-offset-[3px]">Remove</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-ink-muted">Nothing yet. Tell your stylist things like “I like navy with olive” or “I run warm”.</p>}
      <form className="flex items-end gap-2" onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        void save([...value, { id: crypto.randomUUID().slice(0, 8), text: text.trim(), pieceIds: [] }]).then(() => setText(''))
      }}>
        <label className="field flex-1">
          <span className="sr-only">Add a preference</span>
          <input className="input" value={text} maxLength={200} placeholder="e.g. never suggest shorts" onChange={(e) => setText(e.target.value)} />
        </label>
        <Button type="submit" variant="secondary" loading={busy} disabled={!text.trim()}>Add</Button>
      </form>
    </div>
  )
}
