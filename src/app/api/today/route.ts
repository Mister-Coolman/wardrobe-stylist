import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { planToday } from '@/lib/today'
import type { ManualWeather } from '@/lib/today'

const manual = (v: unknown): ManualWeather | undefined => (v === 'warm' || v === 'mild' || v === 'cold' ? v : undefined)

export async function GET(req: Request) {
  return withUser(async (u) => {
    const q = new URL(req.url).searchParams
    return Response.json(await planToday(await getRepo(), u, { date: q.get('date'), manual: manual(q.get('weather')) }))
  })
}

/** "Another look": a fresh plan for the day. */
export async function POST(req: Request) {
  return withUser(async (u) => {
    const body = (await req.json().catch(() => ({}))) as { date?: string; weather?: string }
    return Response.json(await planToday(await getRepo(), u, { date: body.date ?? null, fresh: true, manual: manual(body.weather) }))
  })
}
