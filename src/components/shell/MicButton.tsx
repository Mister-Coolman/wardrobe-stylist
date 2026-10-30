'use client'
import Link from 'next/link'
import { Microphone } from '@phosphor-icons/react'

/** The one circle in the app (style guide §6). Opens the stylist thread. */
export function MicButton() {
  return (
    <Link href="/stylist" aria-label="Talk to your stylist"
      className="press fixed right-5 z-30 flex h-14 w-14 items-center justify-center rounded-mic border border-ink bg-paper text-ink bottom-[calc(72px+env(safe-area-inset-bottom))]">
      <Microphone size={24} weight="light" aria-hidden />
    </Link>
  )
}
