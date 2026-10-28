import { BottomNav } from '@/components/shell/BottomNav'
import { ChatLauncher } from '@/components/shell/ChatLauncher'
import { requireUser } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser()
  return (
    <>
      <main className="mx-auto max-w-[560px] px-5 pt-[calc(24px+env(safe-area-inset-top))] pb-40">{children}</main>
      <ChatLauncher />
      <BottomNav />
    </>
  )
}
