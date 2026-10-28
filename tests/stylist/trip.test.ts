import { describe, expect, test } from 'vitest'
import { getModels } from '@/lib/models'
import { capsuleReuse } from '@/lib/rules/capsuleReuse'
import { wearLimit } from '@/lib/rules/wearLimit'
import { detectTrips, planTrip } from '@/lib/stylist/trip'
import { cand, ctx, event, garment, profile, wardrobe, weather } from '../fixtures/wardrobe'

const models = getModels()
const mild = async () => weather({ tempLowC: 12, tempHighC: 18, rainProbability: 0 })
const geocode = async () => ({ lat: 41.88, lon: -87.63, name: 'Chicago' })

const tees = [1, 2, 3].map((n) => garment({ id: `tee${n}`, name: `Tee ${n}`, category: 'top', subcategory: 'tshirt', formality: 2, warmth: 2 }))
const base = [
  garment({ id: 'jeans', name: 'Selvedge jeans', category: 'bottom', subcategory: 'jeans', formality: 2, warmth: 2 }),
  garment({ id: 'sneakers', name: 'White sneakers', category: 'shoes', subcategory: 'sneakers', formality: 2 }),
]

describe('wearLimit / capsuleReuse rules', () => {
  test('wearLimit rejects a tee already worn once on the trip', () => {
    const c = { ...ctx({}, [...tees, ...base]), trip: { counts: { tee1: 1 } } }
    expect(wearLimit.check(cand('tee1', 'jeans', 'sneakers'), c)).toHaveLength(1)
    expect(wearLimit.check(cand('tee2', 'jeans', 'sneakers'), c)).toEqual([])
  })
  test('jeans can be worn up to 5 times', () => {
    const c = { ...ctx({}, [...tees, ...base]), trip: { counts: { jeans: 4 } } }
    expect(wearLimit.check(cand('tee2', 'jeans', 'sneakers'), c)).toEqual([])
    c.trip.counts.jeans = 5
    expect(wearLimit.check(cand('tee2', 'jeans', 'sneakers'), c)).toHaveLength(1)
  })
  test('capsuleReuse scores reuse of already-packed pieces', () => {
    const c = { ...ctx({}, [...tees, ...base]), trip: { counts: { jeans: 1, sneakers: 1 } } }
    expect(capsuleReuse.score!(cand('tee2', 'jeans', 'sneakers'), c)).toBeCloseTo(2 / 3)
  })
})

describe('planTrip', () => {
  test('3 days, ample wardrobe: no tee twice, jeans may repeat, packing counts add up', async () => {
    const more = [...tees, ...base, garment({ id: 'oxford', name: 'Oxford', category: 'top', subcategory: 'dress_shirt', formality: 3, warmth: 2 })]
    const t = await planTrip({ destination: 'Chicago', startDate: '2026-10-29', endDate: '2026-10-31', profile, wardrobe: more, events: [], models, weatherFor: mild, geocode })
    expect(t.dayPlans.map((d) => d.date)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31'])
    expect(t.warnings).toEqual([])
    const uses: Record<string, number> = {}
    for (const o of t.outfits) for (const id of o!.garmentIds) uses[id] = (uses[id] ?? 0) + 1
    for (const id of ['tee1', 'tee2', 'tee3']) expect(uses[id] ?? 0).toBeLessThanOrEqual(1)
    expect(t.packingList.reduce((s, p) => s + p.days, 0)).toBe(Object.values(uses).reduce((a, b) => a + b, 0))
    expect(t.lat).toBe(41.88)
  })

  test('4 days, 3 tees, no other tops: 4 day plans and one shortfall warning', async () => {
    const t = await planTrip({ destination: 'Chicago', startDate: '2026-10-29', endDate: '2026-11-01', profile, wardrobe: [...tees, ...base], events: [], models, weatherFor: mild, geocode })
    expect(t.dayPlans).toHaveLength(4)
    expect(t.warnings).toHaveLength(1)
    expect(t.warnings[0]).toContain('3')
    expect(t.warnings[0]).toContain('4 days')
  })

  test('laundry status is ignored on trips (packed clothes start clean)', async () => {
    const dirty = wardrobe.map((g) => ({ ...g, status: 'laundry' as const }))
    const t = await planTrip({ destination: 'Chicago', startDate: '2026-10-29', endDate: '2026-10-29', profile, wardrobe: dirty, events: [], models, weatherFor: mild, geocode })
    expect(t.outfits[0]).not.toBeNull()
  })

  test('trip events set that day’s dress code', async () => {
    const t = await planTrip({ destination: 'Chicago', startDate: '2026-10-29', endDate: '2026-10-29', profile, wardrobe, events: [event({ title: 'Client dinner', date: '2026-10-29', start: '19:00' })], models, weatherFor: mild, geocode })
    expect(t.dayPlans[0].note).toContain('Client dinner')
  })
})

describe('detectTrips', () => {
  test('flight out and flight back make one trip', () => {
    expect(detectTrips([event({ title: 'Flight to Chicago', date: '2026-10-29' }), event({ title: 'Flight to NYC', date: '2026-11-01' })]))
      .toEqual([{ destination: 'Chicago', startDate: '2026-10-29', endDate: '2026-11-01' }])
  })
  test('no return flight → 3 days', () => {
    expect(detectTrips([event({ title: 'Trip to Lisbon', date: '2026-11-10' })]))
      .toEqual([{ destination: 'Lisbon', startDate: '2026-11-10', endDate: '2026-11-13' }])
  })
})
