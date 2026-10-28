import Link from 'next/link'
import { redirect } from 'next/navigation'
import { GearSix } from '@phosphor-icons/react/dist/ssr'
import { BottomNav } from '@/components/shell/BottomNav'
import { ChatLauncher } from '@/components/shell/ChatLauncher'
import { getRepo } from '@/lib/db/repo'
import { requireUser } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser()
  if (!(await (await getRepo()).getProfile(u.userId))) redirect('/onboarding/setup')
  return (
    <>
      <main className="relative mx-auto max-w-[560px] px-5 pt-[calc(24px+env(safe-area-inset-top))] pb-40">
        <Link href="/settings" aria-label="Settings"
          className="absolute right-2 top-[calc(12px+env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center text-ink-muted">
          <GearSix size={24} weight="light" aria-hidden />
        </Link>
        {children}
      </main>
      <ChatLauncher />
      <BottomNav />
    </>
  )
}
