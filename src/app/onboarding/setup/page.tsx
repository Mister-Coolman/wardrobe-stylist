import { redirect } from 'next/navigation'
import { OnboardingSteps } from '@/components/settings/OnboardingSteps'
import { getRepo } from '@/lib/db/repo'
import { DEFAULT_WEAR_LIMITS } from '@/lib/domain/wearLimits'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function Setup() {
  const u = await requireUser()
  if (await (await getRepo()).getProfile(u.userId)) redirect('/stylist')
  return (
    <main className="mx-auto max-w-[560px] px-5 pt-[calc(32px+env(safe-area-inset-top))] pb-[calc(48px+env(safe-area-inset-bottom))]">
      <OnboardingSteps defaults={DEFAULT_WEAR_LIMITS} />
    </main>
  )
}
