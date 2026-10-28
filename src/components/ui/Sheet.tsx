'use client'
import { useEffect, useRef } from 'react'

/** Bottom sheet: radius 12, the one shadow, slides up over 360 ms. Uses <dialog> for focus and Escape. */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} aria-label={label} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="sheet m-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-ink/30">
      <div className="mx-auto max-h-[85dvh] max-w-[560px] overflow-y-auto rounded-t-sheet bg-paper-raised px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-sheet">
        <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-tag bg-rule" />
        {children}
      </div>
    </dialog>
  )
}
