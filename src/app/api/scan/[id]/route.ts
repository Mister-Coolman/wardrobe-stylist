import { getRepo } from '@/lib/db/repo'
import { withUser } from '@/lib/api'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withUser(async (u) => {
    const { id } = await params
    const repo = await getRepo()
    const job = await repo.getScanJob(u.userId, id)
    if (!job) return Response.json({ error: 'not_found' }, { status: 404 })
    const garments = job.status === 'review' ? (await repo.listGarments(u.userId, { confirmed: false })) : []
    return Response.json({ job, garments })
  })
}
