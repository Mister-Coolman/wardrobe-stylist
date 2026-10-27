import type { CalendarEvent, Level, Profile, Weather } from '@/lib/domain/types'
import { geocode as geocodeOpenMeteo } from '@/lib/integrations/weather'
import type { Stylist } from '@/lib/models/types'
import type { DayContext } from '@/lib/rules/types'

export const UNKNOWN_WEATHER: Weather = { tempHighC: 15, tempLowC: 10, rainProbability: 0, windKph: 0, summary: 'unknown' }

export async function buildDayContext(args: {
  date: string; profile: Profile; calendarEvents: CalendarEvent[]; userEvents: CalendarEvent[]
  stylist: Stylist; weatherFor: (lat: number, lon: number) => Promise<Weather>
  geocode?: (place: string) => Promise<{ lat: number; lon: number } | null>
}): Promise<DayContext> {
  const geocode = args.geocode ?? geocodeOpenMeteo
  const all = [...args.calendarEvents, ...args.userEvents]
  const unclassified = all.filter((e) => !e.formality)
  const levels: Record<string, Level> = unclassified.length ? await args.stylist.classifyEvents(unclassified).catch(() => ({})) : {}
  const events = all.map((e) => ({ ...e, formality: e.formality ?? levels[e.title] ?? 2 }) as CalendarEvent)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.start ?? '99:99').localeCompare(b.start ?? '99:99'))
  // user-added events have no time; they count toward the dress code like timed ones
  const timed = events.filter((e) => !e.allDay)
  const requiredFormality = (timed.length ? Math.max(...timed.map((e) => e.formality!)) : 2) as Level

  let changeSuggestion: string | null = null
  const clocked = timed.filter((e) => e.start)
  for (let i = 0; i < clocked.length && !changeSuggestion; i++) for (let j = i + 1; j < clocked.length; j++) {
    const [a, b] = [clocked[i], clocked[j]]
    if (Math.abs(a.formality! - b.formality!) >= 3) {
      changeSuggestion = `Change after ${a.title} — ${b.title} is ${b.formality! > a.formality! ? 'dressier' : 'more casual'}.`
      break
    }
  }

  let lat = args.profile.homeLat, lon = args.profile.homeLon
  for (const e of timed) {
    if (!e.location) continue
    const g = await geocode(e.location).catch(() => null)
    if (g) { lat = g.lat; lon = g.lon; break }
  }
  const weather = await args.weatherFor(lat, lon).catch(() => UNKNOWN_WEATHER)
  return { date: args.date, events, weather, requiredFormality, changeSuggestion }
}
