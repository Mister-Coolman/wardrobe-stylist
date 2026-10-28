import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'

export async function POST(req: Request) {
  return withUser(async (u) => {
    const { outfitId } = (await req.json().catch(() => ({}))) as { outfitId?: string }
    if (!outfitId) return Response.json({ error: 'bad_request' }, { status: 400 })
    const repo = await getRepo()
    const outfit = await repo.getOutfit(u.userId, outfitId)
    if (!outfit) return Response.json({ error: 'not_found' }, { status: 404 })
    await repo.logWear(u.userId, outfitId, outfit.contextDate)
    return Response.json({ ok: true })
  })
}
