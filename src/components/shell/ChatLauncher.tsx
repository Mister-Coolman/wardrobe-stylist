'use client'
import { useState } from 'react'
import { ChatSheet } from './ChatSheet'
import { MicButton } from './MicButton'

export function ChatLauncher() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <MicButton onPress={() => setOpen(true)} />
      <ChatSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
