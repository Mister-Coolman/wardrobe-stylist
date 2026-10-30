'use client'
import { useRef, useState } from 'react'
import { ArrowBendUpLeft } from '@phosphor-icons/react'

const THRESHOLD = 56
const MAX = 80

/** Drag a message right to reply to it, as in iMessage and WhatsApp. Vertical scrolling still works (touch-action: pan-y);
 *  a drag counts only once it's more sideways than up-and-down. The Reply button does the same by mouse or keyboard. */
export function SwipeToReply({ onReply, children, className = '' }: { onReply: () => void; children: React.ReactNode; className?: string }) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; id: number; sideways: boolean | null } | null>(null)

  const end = () => {
    if (start.current && dx >= THRESHOLD) onReply()
    start.current = null
    setDx(0)
  }
  return (
    <div className={`group relative ${className}`}
      onPointerDown={(e) => { if (e.button === 0) start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, sideways: null } }}
      onPointerMove={(e) => {
        const s = start.current
        if (!s || s.id !== e.pointerId) return
        const x = e.clientX - s.x, y = e.clientY - s.y
        if (s.sideways === null && Math.hypot(x, y) > 8) {
          s.sideways = Math.abs(x) > Math.abs(y)
          if (s.sideways) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        }
        if (s.sideways) setDx(Math.max(0, Math.min(MAX, x)))
      }}
      onPointerUp={end} onPointerCancel={() => { start.current = null; setDx(0) }}
      // a mouse drag over a photo would start the browser's image drag and cancel the swipe
      onDragStart={(e) => e.preventDefault()}
      style={{ touchAction: 'pan-y' }}>
      <span aria-hidden className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-ink-muted transition-opacity"
        style={{ opacity: dx / THRESHOLD }}>
        <ArrowBendUpLeft size={20} weight="light" />
      </span>
      <div className={dx ? '' : 'transition-transform duration-150 motion-reduce:transition-none'} style={{ transform: `translateX(${dx}px)` }}>
        {children}
      </div>
      <button type="button" aria-label="Reply to this message" onClick={onReply}
        className="absolute -top-2 right-0 min-h-11 px-2 text-sm text-ink-muted underline underline-offset-[3px] opacity-0 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
        Reply
      </button>
    </div>
  )
}
