import { afterEach, describe, expect, test, vi } from 'vitest'
import { localDate, dayBoundsUtc } from '@/lib/domain/dates'
import { CalendarAuthError, fetchCalendarEvents } from '@/lib/integrations/calendar'
import { fetchWeather, geocode } from '@/lib/integrations/weather'

afterEach(() => vi.unstubAllGlobals())
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('dates', () => {
  test('localDate uses the profile time zone, not UTC', () => {
    const now = new Date('2026-10-28T03:30:00Z') // 23:30 on the 27th in New York
    expect(localDate('America/New_York', now)).toBe('2026-10-27')
    expect(localDate('UTC', now)).toBe('2026-10-28')
  })
  test('dayBoundsUtc spans the local day, DST included', () => {
    expect(dayBoundsUtc('2026-10-27', 'America/New_York')).toEqual(['2026-10-27T04:00:00.000Z', '2026-10-28T04:00:00.000Z'])
    expect(dayBoundsUtc('2026-11-01', 'America/New_York')).toEqual(['2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z'])
  })
})

describe('calendar', () => {
  test('a 23:30 local event lands on that local date, all-day events are flagged', async () => {
    const fetchMock = vi.fn(async () => json({ items: [
      { id: 'a', summary: 'Late drinks', start: { dateTime: '2026-10-27T23:30:00-04:00' }, end: { dateTime: '2026-10-28T01:00:00-04:00' }, location: 'Bar Pisellino', attendees: [{ email: 'sam@x.com' }] },
      { id: 'b', summary: 'Conference', start: { date: '2026-10-27' }, end: { date: '2026-10-28' } },
      { id: 'c', summary: 'Cancelled', status: 'cancelled', start: { dateTime: '2026-10-27T09:00:00-04:00' } },
    ] }))
    vi.stubGlobal('fetch', fetchMock)
    const evs = await fetchCalendarEvents('tok', '2026-10-27', 'America/New_York')
    expect(evs).toHaveLength(2)
    expect(evs[0]).toMatchObject({ title: 'Late drinks', date: '2026-10-27', start: '23:30', allDay: false, location: 'Bar Pisellino', attendees: ['sam@x.com'], source: 'calendar' })
    expect(evs[1]).toMatchObject({ title: 'Conference', allDay: true, start: null })
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]))
    expect(url.searchParams.get('singleEvents')).toBe('true')
    expect(url.searchParams.get('timeMin')).toBe('2026-10-27T04:00:00.000Z')
  })
  test('401 throws CalendarAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)))
    await expect(fetchCalendarEvents('tok', '2026-10-27', 'UTC')).rejects.toBeInstanceOf(CalendarAuthError)
  })
})

describe('weather', () => {
  test('geocode returns the first match or null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ results: [{ latitude: 41.88, longitude: -87.63, name: 'Chicago' }] })))
    expect(await geocode('Chicago')).toEqual({ lat: 41.88, lon: -87.63, name: 'Chicago' })
    vi.stubGlobal('fetch', vi.fn(async () => json({})))
    expect(await geocode('Nowhere')).toBeNull()
  })
  test('fetchWeather maps daily values and finds when rain starts', async () => {
    const hourly = Array.from({ length: 24 }, (_, h) => (h >= 17 ? 80 : 10))
    vi.stubGlobal('fetch', vi.fn(async () => json({
      daily: { temperature_2m_max: [14.2], temperature_2m_min: [8.6], precipitation_probability_max: [80], wind_speed_10m_max: [22], weather_code: [61] },
      hourly: { precipitation_probability: hourly },
    })))
    expect(await fetchWeather(40.7, -74, '2026-10-27', 'America/New_York')).toEqual({ tempHighC: 14, tempLowC: 9, rainProbability: 80, windKph: 22, summary: 'Rain from 17:00' })
  })
  test('the low and high are for the hours you’re dressed (7:00–22:00), not the 5 a.m. low', async () => {
    // New Haven, 31 Oct: 4° before dawn, 11° by 7:00, 14° at 15:00, 9° at 22:00
    const temps = Array.from({ length: 24 }, (_, h) => (h < 6 ? 4 : h < 7 ? 8 : h <= 15 ? 11 + (h - 7) * 0.4 : h <= 22 ? 14 - (h - 15) * (5 / 7) : 6))
    vi.stubGlobal('fetch', vi.fn(async () => json({
      daily: { temperature_2m_max: [14.2], temperature_2m_min: [4], precipitation_probability_max: [0], wind_speed_10m_max: [10], weather_code: [1] },
      hourly: { precipitation_probability: Array(24).fill(0), temperature_2m: temps },
    })))
    expect(await fetchWeather(41.3, -72.9, '2026-10-31', 'America/New_York')).toMatchObject({ tempLowC: 9, tempHighC: 14 })
  })
})
