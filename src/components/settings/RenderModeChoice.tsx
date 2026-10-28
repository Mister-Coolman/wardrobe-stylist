'use client'
import type { RenderMode } from '@/lib/domain/types'

const OPTIONS: [RenderMode, string, string][] = [
  ['flatlay', 'Flat lay', 'Your pieces laid out on paper, like a lookbook page.'],
  ['tryon', 'Try-on', 'The outfit on you — needs a full-length photo.'],
  ['none', 'Pieces', 'Just the cutouts. Fastest.'],
]

export function RenderModeChoice({ value, onChange, hasPhoto }: { value: RenderMode; onChange: (m: RenderMode) => void; hasPhoto: boolean }) {
  return (
    <div role="radiogroup" aria-label="Show outfits as" className="flex flex-col divide-y divide-rule border-y border-rule">
      {OPTIONS.map(([m, label, hint]) => (
        <label key={m} className="flex min-h-14 cursor-pointer items-start gap-3 py-3">
          <input type="radio" name="render-mode" className="mt-1 h-5 w-5 accent-[var(--ink)]" checked={value === m} onChange={() => onChange(m)} aria-label={label} />
          <span>
            <span className="font-medium">{label}</span>
            <span className="block text-sm text-ink-muted">{m === 'tryon' && !hasPhoto ? `${hint} Until then you’ll see a flat lay.` : hint}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
