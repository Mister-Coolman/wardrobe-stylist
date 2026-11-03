import type { TextareaHTMLAttributes } from 'react'

/** A one-line text field whose text scrolls sideways under a swipe. A plain input clips a long name, and on a phone
 *  the rest can only be reached by moving the cursor through it; a textarea that doesn't wrap scrolls like any box. */
export function LineInput({ value, onChange, className = '', ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string; onChange: (value: string) => void
}) {
  return (
    <textarea
      {...rest}
      rows={1}
      wrap="off"
      value={value}
      // a pasted line break would make a second line; Enter would too
      onChange={(e) => onChange(e.target.value.replace(/\s*[\r\n]+\s*/g, ' '))}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
      className={`input no-scrollbar resize-none overflow-x-auto overflow-y-hidden whitespace-pre leading-6 ${className}`}
    />
  )
}
