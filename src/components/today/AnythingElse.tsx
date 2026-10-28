'use client'
import { useState } from 'react'
import { Tag } from '@/components/ui/Tag'

const QUICK = ['Gym', 'Drinks', 'Dinner out', 'Date', 'Outdoors']

/** "Anything today that's not on your calendar?" — quick chips or free text. */
export function AnythingElse({ added, onAdd, onDismiss, busy }: { added: string[]; onAdd: (title: string) => void; onDismiss: () => void; busy: boolean }) {
  const [text, setText] = useState('')
  return (
    <section className="mt-10 border-t border-rule pt-6">
      <h2 className="font-medium">Anything today that’s not on your calendar?</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <Tag key={q} selected={added.includes(q)} disabled={busy || added.includes(q)} onClick={() => onAdd(q)}>{q}</Tag>
        ))}
        <Tag disabled={busy} onClick={onDismiss}>Nothing else</Tag>
      </div>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onAdd(text.trim()); setText('') } }}>
        <label className="field flex-1">
          <span className="sr-only">Something else</span>
          <input className="input" placeholder="Something else — “site visit at 3”" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} />
        </label>
        <button type="submit" disabled={busy || !text.trim()} className="press min-h-11 rounded-control border border-ink px-4 font-semibold disabled:opacity-50">Add</button>
      </form>
    </section>
  )
}
