import { morningNote } from '@/lib/agent/morning'
import { getRepo } from '@/lib/db/repo'

export const maxDuration = 300

/** Vercel cron, daily at 11:00 UTC (vercel.json); Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const repo = await getRepo()
  let sent = 0
  for (const p of await repo.listProfiles()) {
    try { if (await morningNote(repo, p, {})) sent++ } catch (e) { console.error('morning note failed', p.userId, e) }
  }
  return Response.json({ sent })
}
