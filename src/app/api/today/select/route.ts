import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { pollsEnabled } from '@/lib/polls'
import { friendsPick, planToday } from '@/lib/today'

/** "Wear Look 02": makes the friends' pick today's look again, with the poll as a fitting note. */
export async function POST(req: Request) {
  if (!pollsEnabled()) return new Response('Not found', { status: 404 })
  return withUser(async (u) => {
    const { outfitId } = (await req.json().catch(() => ({}))) as { outfitId?: string }
    const repo = await getRepo()
    const o = outfitId ? await repo.getOutfit(u.userId, outfitId) : null
    if (!o) return Response.json({ error: 'not_found' }, { status: 404 })
    const pick = await friendsPick(repo, u.userId, o.contextDate)
    const note = pick?.outfitId === o.id ? [{ ruleId: 'pollWinner', passed: true, note: `Friends picked this, ${pick.score}` }] : []
    const { id: _id, ...copy } = o
    await repo.saveOutfit({ ...copy, ruleReport: [...o.ruleReport.filter((r) => r.ruleId !== 'pollWinner'), ...note] })
    return Response.json(await planToday(repo, u, { date: o.contextDate }))
  })
}
