import { geocode } from '@/lib/integrations/weather'

/** Open-Meteo, or a fixed answer under WEATHER=fixture so e2e stays offline. */
export async function geocodePlace(place: string): Promise<{ lat: number; lon: number; name: string } | null> {
  if (process.env.WEATHER === 'fixture') return { lat: 40.65, lon: -73.95, name: place.trim().replace(/^\w/, (c) => c.toUpperCase()) }
  return geocode(place)
}
