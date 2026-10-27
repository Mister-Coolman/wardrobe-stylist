'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'

export function DevLogin({ email }: { email: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button variant="secondary" loading={busy} onClick={async () => {
      setBusy(true)
      await fetch('/api/dev-login', { method: 'POST' })
      router.push('/today')
      router.refresh()
    }}>
      Continue as {email}
    </Button>
  )
}
