import 'server-only'
import type { Trip } from '@/lib/domain/types'
import { addDays, localDate } from '@/lib/domain/dates'
import type { Repo } from '@/lib/db/repo'
import { fetchCalendarRange } from '@/lib/integrations/calendar'
import { fetchWeather } from '@/lib/integrations/weather'
import type { Models } from '@/lib/models/types'
import { profileFor } from '@/lib/profile'
import { planTrip } from '@/lib/stylist/trip'
import type { SessionUser } from '@/lib/session'

const FIXTURE_TRIP_WEATHER = { tempHighC: 12, tempLowC: 6, rainProbability: 20, windKph: 30, summary: 'Windy' }

export interface TripRequest { destination: string; startDate?: string; endDate?: string; days?: number }

/** Plans a trip, saves each day's outfit, then the trip. */
export async function createTrip(repo: Repo, user: SessionUser, req: TripRequest, deps: {
  models: Pick<Models, 'stylist' | 'renderer'>; geocode?: (place: string) => Promise<{ lat: number; lon: number; name?: string } | null>
}): Promise<Trip> {
  const profile = await profileFor(repo, user.userId)
  const startDate = req.startDate ?? addDays(localDate(profile.tz), 1)
  const endDate = req.endDate && req.endDate >= startDate ? req.endDate : addDays(startDate, Math.max(1, Math.min(req.days ?? 3, 21)) - 1)
  const wardrobe = await repo.listGarments(user.userId, { confirmed: true })
  const events = user.googleAccessToken
    ? await fetchCalendarRange(user.googleAccessToken, startDate, endDate, profile.tz, user.userId).catch(() => [])
    : []
  const plan = await planTrip({
    destination: req.destination, startDate, endDate, profile, wardrobe, events, models: deps.models, geocode: deps.geocode,
    weatherFor: async (lat, lon, date) => (process.env.WEATHER === 'fixture' ? FIXTURE_TRIP_WEATHER : fetchWeather(lat, lon, date, profile.tz)),
  })
  const { outfits, ...trip } = plan
  for (const [i, o] of outfits.entries()) {
    if (o) trip.dayPlans[i].outfitId = (await repo.saveOutfit({ ...o, userId: user.userId })).id
  }
  return repo.saveTrip({ ...trip, userId: user.userId })
}
