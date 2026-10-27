import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'tertiary'

const styles: Record<Variant, string> = {
  primary: 'h-12 px-6 rounded-control bg-accent text-paper font-semibold',
  secondary: 'h-12 px-6 rounded-control border border-ink text-ink font-semibold',
  tertiary: 'min-h-11 px-1 text-ink underline underline-offset-[3px] font-medium',
}

export function Button({ variant = 'primary', loading = false, className = '', children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`press inline-flex items-center justify-center gap-2 text-base disabled:opacity-60 ${styles[variant]} ${className}`}
    >
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  )
}
