import type { ButtonHTMLAttributes } from 'react'

export function Tag({ selected = false, className = '', children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      aria-pressed={selected}
      className={`press label min-h-11 px-3 rounded-tag border ${selected ? 'bg-ink text-paper border-ink' : 'border-rule text-ink'} ${className}`}
    >
      {children}
    </button>
  )
}
