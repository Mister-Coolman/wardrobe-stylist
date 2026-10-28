import { getRepo } from '@/lib/db/repo'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'
import { currentUser } from '@/lib/session'

/** Development only: fill an empty closet with the sample wardrobe. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production' || (process.env.MODELS ?? 'mock') !== 'mock') return new Response('Not found', { status: 404 })
  const u = await currentUser()
  if (!u) return new Response('Signed out', { status: 401 })
  const repo = await getRepo()
  if (!(await repo.listGarments(u.userId)).length) await repo.insertGarments(sampleCloset(u.userId))
  return Response.redirect(new URL('/closet', req.url), 303)
}
