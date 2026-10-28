import { z } from 'zod'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { getModels } from '@/lib/models'
import { createTrip } from '@/lib/trips'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Body = z.object({ destination: z.string().trim().min(1).max(80), startDate: day, endDate: day })
  .refine((b) => b.endDate >= b.startDate, { message: 'end before start' })
  .refine((b) => (Date.parse(b.endDate) - Date.parse(b.startDate)) / 86_400_000 < 21, { message: 'trip too long' })

export async function GET() {
  return withUser(async (u) => Response.json({ trips: await (await getRepo()).listTrips(u.userId) }))
}

export async function POST(req: Request) {
  return withUser(async (u) => {
    const body = Body.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request', message: body.error.issues[0]?.message }, { status: 400 })
    const trip = await createTrip(await getRepo(), u, body.data, { models: getModels() })
    return Response.json({ trip })
  })
}
