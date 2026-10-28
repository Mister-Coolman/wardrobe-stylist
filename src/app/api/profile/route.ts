import { z } from 'zod'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { DEFAULT_WEAR_LIMITS } from '@/lib/domain/wearLimits'
import { geocodePlace } from '@/lib/geocode'
import { profileFor } from '@/lib/profile'

const validTz = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }
const LIMIT_KEYS = Object.keys(DEFAULT_WEAR_LIMITS).concat(['shirt', 'dress_shirt', 'skirt', 'shorts', 'dress', 'top', 'bottom'])

const Patch = z.object({
  homeCity: z.string().trim().min(1).max(80),
  tz: z.string().refine(validTz, 'unknown time zone'),
  renderMode: z.enum(['tryon', 'flatlay', 'none']),
  styleProfile: z.object({ summary: z.string().max(300), traits: z.array(z.string().max(40)).max(12), palette: z.array(z.string().max(30)).max(12),
    avoid: z.array(z.string().max(40)).max(12), sourceImages: z.array(z.string()).max(12) }).nullable(),
  wearLimits: z.record(z.string().refine((k) => LIMIT_KEYS.includes(k)), z.number().int().min(1).max(30).nullable()),
}).partial()

export async function GET() {
  return withUser(async (u) => Response.json({ profile: await profileFor(await getRepo(), u.userId) }))
}

export async function PATCH(req: Request) {
  return withUser(async (u) => {
    const body = Patch.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request', message: body.error.issues[0]?.message }, { status: 400 })
    const repo = await getRepo()
    const profile = await profileFor(repo, u.userId)
    const { homeCity, ...rest } = body.data
    const next = { ...profile, ...rest, wearLimits: rest.wearLimits ? { ...profile.wearLimits, ...rest.wearLimits } : profile.wearLimits }
    if (homeCity !== undefined && homeCity !== profile.homeCity) {
      const place = await geocodePlace(homeCity)
      if (!place) return Response.json({ error: 'place_not_found' }, { status: 422 })
      Object.assign(next, { homeCity: place.name, homeLat: place.lat, homeLon: place.lon })
    }
    await repo.upsertProfile(next)
    return Response.json({ profile: next })
  })
}
