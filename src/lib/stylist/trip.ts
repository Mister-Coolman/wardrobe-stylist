import type { CalendarEvent, Garment, Outfit, Profile, Trip, Weather } from '@/lib/domain/types'
import { addDays, daysBetween } from '@/lib/domain/dates'
import { limitFor } from '@/lib/domain/wearLimits'
import { geocode as geocodeOpenMeteo } from '@/lib/integrations/weather'
import type { Models } from '@/lib/models/types'
import { tripRules } from '@/lib/rules/registry'
import type { TripUsage } from '@/lib/rules/types'
import { buildDayContext } from './dayContext'
import { planOutfit } from './loop'

type OutfitDraft = Omit<Outfit, 'id' | 'userId'>
export type TripPlan = Omit<Trip, 'id' | 'userId'> & { outfits: (OutfitDraft | null)[] }

const SUB_PLURAL: Partial<Record<Garment['subcategory'], string>> = {
  tshirt: 't-shirts', dress_shirt: 'dress shirts', shirt: 'shirts', sweater: 'sweaters', jeans: 'pairs of jeans', trousers: 'pairs of trousers',
  sweatpants: 'pairs of sweatpants', athletic: 'athletic pieces', shorts: 'pairs of shorts', skirt: 'skirts', dress: 'dresses',
}
const CATEGORY_ORDER = ['outerwear', 'top', 'onepiece', 'bottom', 'shoes', 'accessory', 'underwear', 'socks']

/** Plans each day in order with renders off, carrying wear counts forward; outfits[i] belongs to dayPlans[i]. */
export async function planTrip(args: {
  destination: string; startDate: string; endDate: string; profile: Profile; wardrobe: Garment[]; events: CalendarEvent[]
  models: Pick<Models, 'stylist' | 'renderer'>; weatherFor: (lat: number, lon: number, date: string) => Promise<Weather>
  geocode?: (place: string) => Promise<{ lat: number; lon: number; name?: string } | null>
}): Promise<TripPlan> {
  const place = await (args.geocode ?? geocodeOpenMeteo)(args.destination).catch(() => null)
  const lat = place?.lat ?? args.profile.homeLat, lon = place?.lon ?? args.profile.homeLon
  // packed clothes start clean; the trip's own wear limits take over from laundry status
  const wardrobe = args.wardrobe.filter((g) => g.confirmed).map((g) => ({ ...g, status: 'clean' as const, wearsSinceWash: 0 }))
  const days = daysBetween(args.startDate, args.endDate)
  const usage: TripUsage = { counts: {} }
  const dayPlans: Trip['dayPlans'] = []
  const outfits: (OutfitDraft | null)[] = []
  const short = new Map<string, string>()

  for (const date of days) {
    // the destination sets the weather; events' own locations are home-city noise on a trip
    const events = args.events.filter((e) => e.date === date).map((e) => ({ ...e, location: null }))
    const day = await buildDayContext({ date, profile: { ...args.profile, homeLat: lat, homeLon: lon }, calendarEvents: events, userEvents: [],
      stylist: args.models.stylist, weatherFor: (la, lo) => args.weatherFor(la, lo, date), geocode: async () => null })
    const r = await planOutfit({ day, wardrobe, profile: args.profile, models: args.models, rules: tripRules, trip: { counts: { ...usage.counts } }, renderMode: 'none' })
    const timed = day.events.filter((e) => !e.allDay).map((e) => e.title)
    if (!r.ok) {
      dayPlans.push({ date, outfitId: null, note: `Nothing packable — missing ${r.missing.join(', ')}` })
      outfits.push(null)
      continue
    }
    for (const id of r.outfit.garmentIds) usage.counts[id] = (usage.counts[id] ?? 0) + 1
    if (r.bestEffort) {
      const over = r.outfit.garmentIds.map((id) => wardrobe.find((g) => g.id === id)!).filter((g) => {
        const limit = limitFor(g, args.profile.wearLimits)
        return limit != null && usage.counts[g.id] > limit
      })
      for (const g of over) if (!short.has(g.subcategory)) short.set(g.subcategory, shortfall(g, wardrobe, days.length, args.profile))
    }
    dayPlans.push({ date, outfitId: null, note: timed.length ? timed.join(' · ') : r.outfit.title })
    outfits.push(r.outfit)
  }

  const packingList = Object.entries(usage.counts)
    .map(([garmentId, n]) => ({ garmentId, days: n, cat: wardrobe.find((g) => g.id === garmentId)?.category ?? 'accessory' }))
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.cat) - CATEGORY_ORDER.indexOf(b.cat) || b.days - a.days)
    .map(({ garmentId, days: d }) => ({ garmentId, days: d }))

  return { destination: place?.name ?? args.destination, lat, lon, startDate: args.startDate, endDate: args.endDate, dayPlans, packingList, warnings: [...short.values()], outfits }
}

function shortfall(g: Garment, wardrobe: Garment[], days: number, profile: Profile): string {
  const owned = wardrobe.filter((x) => x.subcategory === g.subcategory).length
  const limit = limitFor(g, profile.wearLimits)
  const what = SUB_PLURAL[g.subcategory] ?? `${g.subcategory.replace('_', ' ')} pieces`
  const swap = g.category === 'top' ? 'pack a knit' : g.category === 'bottom' ? 'pack another pair' : 'pack a spare'
  return `You own ${owned} ${what} for ${days} days at ${limit} wear${limit === 1 ? '' : 's'} each — wash one or ${swap}.`
}

const TRIP_TITLE = /(?:flight|fly|train|drive|trip) to ([A-Z][\w.' -]*?)(?:\s*[(\-–—,]|\s+(?:on|for|at|via)\b|$)/i

/** "Flight to Chicago" … "Flight to NYC" → Chicago, out → back. No return leg → 3 days. */
export function detectTrips(events: CalendarEvent[]): { destination: string; startDate: string; endDate: string }[] {
  const legs = events.map((e) => ({ e, m: e.title.match(TRIP_TITLE) })).filter((x) => x.m)
    .sort((a, b) => a.e.date.localeCompare(b.e.date))
  const trips: { destination: string; startDate: string; endDate: string }[] = []
  for (let i = 0; i < legs.length; i++) {
    const dest = legs[i].m![1].trim()
    const back = legs[i + 1]
    if (back && back.e.date > legs[i].e.date && back.e.date <= addDays(legs[i].e.date, 21)) {
      trips.push({ destination: dest, startDate: legs[i].e.date, endDate: back.e.date })
      i++
    } else trips.push({ destination: dest, startDate: legs[i].e.date, endDate: addDays(legs[i].e.date, 3) })
  }
  return trips
}
