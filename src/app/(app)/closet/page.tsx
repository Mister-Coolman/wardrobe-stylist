import { ClosetView } from '@/components/closet/ClosetView'
import { getRepo } from '@/lib/db/repo'
import { DEFAULT_WEAR_LIMITS } from '@/lib/domain/wearLimits'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function ClosetPage() {
  const u = await requireUser()
  const repo = await getRepo()
  const [garments, profile] = await Promise.all([repo.listGarments(u.userId, { confirmed: true }), repo.getProfile(u.userId)])
  const canSeed = process.env.NODE_ENV !== 'production' && (process.env.MODELS ?? 'mock') === 'mock'
  return <ClosetView initial={garments} limits={profile?.wearLimits ?? DEFAULT_WEAR_LIMITS} canSeed={canSeed} />
}
