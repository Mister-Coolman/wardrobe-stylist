import { z } from 'zod'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { localDate } from '@/lib/domain/dates'
import { profileFor } from '@/lib/profile'
import { planToday } from '@/lib/today'

const Body = z.object({ title: z.string().trim().min(1).max(80), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), weather: z.enum(['warm', 'mild', 'cold']).optional() })

/** Adds an off-calendar event ("Drinks") for the day, then replans. */
export async function POST(req: Request) {
  return withUser(async (u) => {
    const body = Body.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request' }, { status: 400 })
    const repo = await getRepo()
    const date = body.data.date ?? localDate((await profileFor(repo, u.userId)).tz)
    await repo.addUserEvent({ userId: u.userId, date, start: null, end: null, allDay: false, title: body.data.title, location: null, attendees: [], source: 'user' })
    return Response.json(await planToday(repo, u, { date, fresh: true, manual: body.data.weather }))
  })
}
