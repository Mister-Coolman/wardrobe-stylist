import { TodayView } from '@/components/today/TodayView'
import { getRepo } from '@/lib/db/repo'
import { profileFor } from '@/lib/profile'
import { requireUser } from '@/lib/session'
import { unitFor } from '@/lib/ui/temperature'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const u = await requireUser()
  const repo = await getRepo()
  const [wardrobe, profile] = await Promise.all([repo.listGarments(u.userId, { confirmed: true }), profileFor(repo, u.userId)])
  return <TodayView wardrobe={wardrobe} unit={unitFor(profile)} />
}
