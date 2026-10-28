import { TodayView } from '@/components/today/TodayView'
import { getRepo } from '@/lib/db/repo'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const u = await requireUser()
  const wardrobe = await (await getRepo()).listGarments(u.userId, { confirmed: true })
  return <TodayView wardrobe={wardrobe} />
}
