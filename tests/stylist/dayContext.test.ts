import { describe, expect, test, vi } from 'vitest'
import { buildDayContext } from '@/lib/stylist/dayContext'
import { getModels } from '@/lib/models'
import { event, profile, weather } from '../fixtures/wardrobe'

const { stylist } = getModels()
const base = { date: '2026-10-27', profile, stylist, userEvents: [], geocode: async () => null }

describe('buildDayContext', () => {
  test('all-day events do not set the dress code', async () => {
    const d = await buildDayContext({ ...base, weatherFor: async () => weather(),
      calendarEvents: [event({ title: 'Client conference', allDay: true }), event({ title: 'Gym', start: '07:00' })] })
    expect(d.requiredFormality).toBe(1)
  })
  test('no events → casual (2)', async () => {
    const d = await buildDayContext({ ...base, weatherFor: async () => weather(), calendarEvents: [] })
    expect(d.requiredFormality).toBe(2)
    expect(d.changeSuggestion).toBeNull()
  })
  test('gym then client review → smart, with a change suggestion naming both', async () => {
    const d = await buildDayContext({ ...base, weatherFor: async () => weather(),
      calendarEvents: [event({ title: 'Client review', start: '10:00' }), event({ title: 'Gym', start: '07:00' })] })
    expect(d.requiredFormality).toBe(4)
    expect(d.changeSuggestion).toBe('Change after Gym — Client review is dressier.')
    expect(d.events.map((e) => e.title)).toEqual(['Gym', 'Client review'])
    expect(d.events.find((e) => e.title === 'Gym')?.formality).toBe(1)
  })
  test('user-added events count too', async () => {
    const d = await buildDayContext({ ...base, weatherFor: async () => weather(), calendarEvents: [],
      userEvents: [event({ title: 'Dinner out', source: 'user' })] })
    expect(d.requiredFormality).toBe(3)
  })
  test('weather comes from the first timed event location that geocodes', async () => {
    const weatherFor = vi.fn(async () => weather())
    await buildDayContext({ ...base, weatherFor,
      geocode: async (p: string) => (p === 'Chicago' ? { lat: 41.88, lon: -87.63, name: 'Chicago' } : null),
      calendarEvents: [event({ title: 'Call', start: '09:00', location: 'Zoom' }), event({ title: 'Offsite', start: '11:00', location: 'Chicago' })] })
    expect(weatherFor).toHaveBeenCalledWith(41.88, -87.63)
  })
  test('falls back to home, and weather failure gives summary unknown', async () => {
    const weatherFor = vi.fn(async () => { throw new Error('down') })
    const d = await buildDayContext({ ...base, weatherFor, calendarEvents: [] })
    expect(weatherFor).toHaveBeenCalledWith(profile.homeLat, profile.homeLon)
    expect(d.weather.summary).toBe('unknown')
  })
})
