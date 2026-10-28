import { randomUUID } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { getRepo } from '@/lib/db/repo'
import { pollResult, pollsEnabled, voterKey } from '@/lib/polls'

export const VOTER_COOKIE = 'ws_voter'

/** Public: anyone with the link votes once (cookie id + ip). */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!pollsEnabled()) return new Response('Not found', { status: 404 })
  const { slug } = await params
  const { outfitId } = (await req.json().catch(() => ({}))) as { outfitId?: string }
  if (!outfitId) return Response.json({ error: 'bad_request' }, { status: 400 })
  const jar = await cookies()
  let id = jar.get(VOTER_COOKIE)?.value
  if (!id) { id = randomUUID(); jar.set(VOTER_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 }) }
  const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  const repo = await getRepo()
  const status = await repo.vote(slug, outfitId, voterKey(id, ip))
  if (status === 'invalid') return Response.json({ error: 'invalid' }, { status: 404 })
  const poll = (await repo.getPoll(slug))!
  return Response.json({ status, result: pollResult(poll, await repo.tally(slug)) }, { status: status === 'duplicate' ? 409 : 200 })
}
