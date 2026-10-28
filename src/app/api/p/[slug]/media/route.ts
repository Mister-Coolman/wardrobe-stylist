import { getRepo } from '@/lib/db/repo'
import { pollsEnabled } from '@/lib/polls'
import { getStorage } from '@/lib/storage'

/** Public media for a poll: only the renders and cutouts of the outfits in that poll. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!pollsEnabled()) return new Response('Not found', { status: 404 })
  const { slug } = await params
  const u = new URL(req.url).searchParams.get('u') ?? ''
  const repo = await getRepo()
  const poll = await repo.getPoll(slug)
  if (!poll) return new Response('Not found', { status: 404 })
  const outfits = (await Promise.all(poll.outfitIds.map((id) => repo.getOutfit(poll.userId, id)))).filter((o) => !!o)
  const garments = await repo.listGarments(poll.userId)
  const allowed = new Set([
    ...outfits.map((o) => o!.renderUrl).filter((x): x is string => !!x),
    ...garments.filter((g) => outfits.some((o) => o!.garmentIds.includes(g.id))).map((g) => g.cutoutUrl),
  ])
  if (!allowed.has(u)) return new Response('Not found', { status: 404 })
  try {
    const data = await getStorage().read(u)
    const type = u.endsWith('.svg') ? 'image/svg+xml' : u.endsWith('.png') ? 'image/png' : 'image/jpeg'
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=3600' } })
  } catch { return new Response('Not found', { status: 404 }) }
}
