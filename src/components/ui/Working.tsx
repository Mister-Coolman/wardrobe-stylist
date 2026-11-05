'use client'
import { useEffect, useState } from 'react'

/** [seconds in, what's happening]: planning takes 10–20 s and the picture another 15–30, so the last steps say so */
export type Steps = [number, string][]

export const LOOK_STEPS: Steps = [
  [0, 'Checking the forecast…'], [2, 'Reading your calendar…'], [5, 'Picking from what’s clean…'],
  [12, 'Checking each look against the day…'], [20, 'Drawing the picture, usually about 20 seconds…'], [50, 'Almost there, giving it one more pass…'],
]
export const REPLY_STEPS: Steps = [
  [0, 'Reading your message…'], [4, 'Checking the weather and your calendar…'], [9, 'Picking from what’s clean…'],
  [16, 'Checking each look against the day…'], [24, 'Drawing the picture, usually about 20 seconds…'], [55, 'Almost there, giving it one more pass…'],
]
export const DRAW_STEPS: Steps = [[0, 'Drawing the picture, usually about 20 seconds…'], [35, 'Almost there, giving it one more pass…']]

/** Seconds since this mounted, ticking once a second */
function useSeconds() {
  const [s, setS] = useState(0)
  useEffect(() => { const t = setInterval(() => setS((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  return s
}

/** What the stylist is doing right now, by time elapsed */
export function WorkingLine({ steps, className = '' }: { steps: Steps; className?: string }) {
  const s = useSeconds()
  const text = [...steps].reverse().find(([at]) => s >= at)?.[1] ?? steps[0][1]
  return <p aria-live="polite" className={`text-sm text-ink-muted ${className}`}><span key={text} className="fade-in inline-block">{text}</span></p>
}

/** The 4:5 frame a picture will fill, shimmering softly while it's drawn */
export function PictureFrame({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`shimmer aspect-[4/5] bg-studio ${className}`} />
}

/** A thread reply on its way: the step line, and from `frameAfter` seconds (once it's likely a look) the frame */
export function ReplyWorking({ frameAfter = 6 }: { frameAfter?: number }) {
  const s = useSeconds()
  return (
    <div>
      <WorkingLine steps={REPLY_STEPS} />
      {s >= frameAfter && <PictureFrame className="settle-in mt-3 max-w-xs rounded-sm" />}
    </div>
  )
}
