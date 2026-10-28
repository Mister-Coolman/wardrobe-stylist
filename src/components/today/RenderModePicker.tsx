'use client'
import type { RenderMode } from '@/lib/domain/types'

const MODES: [RenderMode, string][] = [['tryon', 'Try-on'], ['flatlay', 'Flat lay'], ['none', 'Pieces']]

/** Text-only segmented control (style guide §6). */
export function RenderModePicker({ value, onChange, disabled }: { value: RenderMode; onChange: (m: RenderMode) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Show the look as" className="flex gap-5 text-sm">
      {MODES.map(([m, label]) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} disabled={disabled} onClick={() => value !== m && onChange(m)}
          className={`min-h-11 ${value === m ? 'font-semibold text-ink underline underline-offset-[6px]' : 'text-ink-muted'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}
