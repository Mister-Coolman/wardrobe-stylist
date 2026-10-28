import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { localDate } from '@/lib/domain/dates'
import { pollResult, pollsEnabled } from '@/lib/polls'
import { profileFor } from '@/lib/profile'
import { planToday } from '@/lib/today'

/** The owner's latest poll for a day, with the tally. */
export async function GET(req: Request) {
  if (!pollsEnabled()) return new Response('Not found', { status: 404 })
  return withUser(async (u) => {
    const repo = await getRepo()
    const date = new URL(req.url).searchParams.get('date') ?? localDate((await profileFor(repo, u.userId)).tz)
    const poll = await repo.latestPollFor(u.userId, date)
    if (!poll) return Response.json({ poll: null })
    const outfits = await repo.listOutfitsFor(u.userId, date)
    const lookNumber = Object.fromEntries(outfits.map((o, i) => [o.id, i + 1]))
    return Response.json({ poll, result: pollResult(poll, await repo.tally(poll.slug)), lookNumber })
  })
}

/** Polls the last two or three looks for the day, making a second one first if needed. */
export async function POST(req: Request) {
  if (!pollsEnabled()) return new Response('Not found', { status: 404 })
  return withUser(async (u) => {
    const repo = await getRepo()
    const body = (await req.json().catch(() => ({}))) as { date?: string }
    const date = body.date ?? localDate((await profileFor(repo, u.userId)).tz)
    let outfits = await repo.listOutfitsFor(u.userId, date)
    if (outfits.length < 2) {
      const plan = await planToday(repo, u, { date, fresh: true })
      if (!plan.result.ok) return Response.json({ error: 'insufficient_wardrobe' }, { status: 422 })
      outfits = await repo.listOutfitsFor(u.userId, date)
    }
    const picked = outfits.slice(-3)
    const poll = await repo.createPoll(u.userId, picked.map((o) => o.id), date)
    return Response.json({ slug: poll.slug, url: new URL(`/p/${poll.slug}`, req.url).toString() })
  })
}
