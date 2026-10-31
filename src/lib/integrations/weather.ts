import type { Weather } from '@/lib/domain/types'

/** Open-Meteo geocoding; null when nothing matches (e.g. "Zoom"). */
export async function geocode(place: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(place)}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const r = ((await res.json()) as { results?: { latitude: number; longitude: number; name: string }[] }).results?.[0]
    return r ? { lat: r.latitude, lon: r.longitude, name: r.name } : null
  } catch { return null }
}

const CODES: [number[], string][] = [
  [[0], 'Clear'], [[1, 2], 'Partly cloudy'], [[3], 'Overcast'], [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'], [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain'], [[71, 73, 75, 77, 85, 86], 'Snow'], [[95, 96, 99], 'Storms'],
]

/** The hours a look is dressed for */
const DAY_START = 7
const DAY_END = 22

export async function fetchWeather(lat: number, lon: number, date: string, tz: string): Promise<Weather> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.search = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: tz, start_date: date, end_date: date,
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code',
    hourly: 'precipitation_probability,temperature_2m',
  }).toString()
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`weather ${res.status}`)
  const j = (await res.json()) as {
    daily: Record<string, (number | null)[]>; hourly?: { precipitation_probability?: (number | null)[]; temperature_2m?: (number | null)[] }
  }
  const d = (k: string) => j.daily[k]?.[0] ?? 0
  const rain = Math.round(d('precipitation_probability_max'))
  const firstWet = (j.hourly?.precipitation_probability ?? []).findIndex((p) => (p ?? 0) >= 50)
  const code = d('weather_code')
  const summary = firstWet > 0 ? `Rain from ${String(firstWet).padStart(2, '0')}:00`
    : firstWet === 0 ? 'Rain all day' : CODES.find(([cs]) => cs.includes(code))?.[1] ?? 'Mixed'
  // dress for the hours you're out (7:00–22:00): the day's low is usually just before dawn
  const awake = (j.hourly?.temperature_2m ?? []).slice(DAY_START, DAY_END + 1).filter((t): t is number => t != null)
  const low = awake.length ? Math.min(...awake) : d('temperature_2m_min')
  const high = awake.length ? Math.max(...awake) : d('temperature_2m_max')
  return { tempHighC: Math.round(high), tempLowC: Math.round(low), rainProbability: rain, windKph: Math.round(d('wind_speed_10m_max')), summary }
}

/** Manual weather when the forecast is unavailable (Today screen asks warm / mild / cold). */
export const MANUAL_WEATHER: Record<'warm' | 'mild' | 'cold', Weather> = {
  warm: { tempHighC: 26, tempLowC: 22, rainProbability: 0, windKph: 0, summary: 'Warm (your call)' },
  mild: { tempHighC: 18, tempLowC: 12, rainProbability: 0, windKph: 0, summary: 'Mild (your call)' },
  cold: { tempHighC: 6, tempLowC: 2, rainProbability: 0, windKph: 0, summary: 'Cold (your call)' },
}
