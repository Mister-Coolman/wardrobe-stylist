'use client'
import { usePathname } from 'next/navigation'
import { MicButton } from './MicButton'

/** The mic on every page opens the stylist thread; on the thread itself the composer has its own. */
export function ChatLauncher() {
  return usePathname().startsWith('/stylist') ? null : <MicButton />
}
