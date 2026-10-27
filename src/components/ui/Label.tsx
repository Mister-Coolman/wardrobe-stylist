import type { HTMLAttributes } from 'react'

export function Label({ className = '', ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...rest} className={`label text-ink-muted ${className}`} />
}
