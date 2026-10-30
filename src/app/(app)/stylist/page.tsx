import { Thread } from '@/components/stylist/Thread'
import { getRepo } from '@/lib/db/repo'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function StylistPage() {
  const u = await requireUser()
  return <Thread initial={await (await getRepo()).listMessages(u.userId, { limit: 50 })} />
}
