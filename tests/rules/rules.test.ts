import { describe, expect, test } from 'vitest'
import { completeness } from '@/lib/rules/completeness'
import { formality } from '@/lib/rules/formality'
import { weather } from '@/lib/rules/weather'
import { availability } from '@/lib/rules/availability'
import { dailyRules, runRules } from '@/lib/rules/registry'
import { cand, ctx, event, wardrobe, weather as wx } from '../fixtures/wardrobe'

describe('completeness', () => {
  test('missing shoes is a violation', () => {
    const v = completeness.check(cand('crew', 'jeans'), ctx())
    expect(v).toHaveLength(1)
    expect(v[0].message).toMatch(/shoes/i)
  })
  test('unknown garment id is a violation', () => {
    const v = completeness.check(cand('crew', 'jeans', 'sneakers', 'ghost'), ctx())
    expect(v.map((x) => x.message)).toContain('Unknown piece')
    expect(v.find((x) => x.message === 'Unknown piece')!.garmentIds).toEqual(['ghost'])
  })
  test('top + bottom + shoes passes', () => expect(completeness.check(cand('crew', 'jeans', 'sneakers'), ctx())).toEqual([]))
  test('without clean shoes in the closet, top + bottom is complete', () => {
    const noShoes = wardrobe.filter((g) => g.category !== 'shoes')
    expect(completeness.check(cand('crew', 'jeans'), ctx({}, noShoes))).toEqual([])
    const shoesInLaundry = wardrobe.map((g) => (g.category === 'shoes' ? { ...g, status: 'laundry' as const } : g))
    expect(completeness.check(cand('crew', 'jeans'), ctx({}, shoesInLaundry))).toEqual([])
  })
})

describe('formality', () => {
  test('jeans at a smart event (required 4) is a violation naming the jeans', () => {
    const v = formality.check(cand('oxford', 'jeans', 'loafers'), ctx({ requiredFormality: 4 }))
    expect(v).toHaveLength(1)
    expect(v[0].garmentIds).toContain('jeans')
  })
  test('dress shoes on a casual day (required 2) pass', () =>
    expect(formality.check(cand('crew', 'jeans', 'loafers'), ctx({ requiredFormality: 2 }))).toEqual([]))
  test('far too dressy (more than required + 2) is a violation', () =>
    expect(formality.check(cand('oxford', 'trousers', 'loafers'), ctx({ requiredFormality: 1 }))).toHaveLength(1))
})

describe('weather', () => {
  const rainy = { weather: wx({ tempLowC: 9, rainProbability: 80 }) }
  test('suede loafers in 80% rain is a violation naming the loafers', () => {
    const v = weather.check(cand('coat', 'crew', 'trousers', 'loafers'), ctx(rainy))
    expect(v).toHaveLength(1)
    expect(v[0].garmentIds).toEqual(['loafers'])
    expect(v[0].message).toMatch(/loafers/i)
  })
  test('leather boots in the same rain pass', () =>
    expect(weather.check(cand('coat', 'crew', 'trousers', 'boots'), ctx(rainy))).toEqual([]))
  test('too light for 9° low is a violation', () =>
    expect(weather.check(cand('oxford', 'trousers', 'boots'), ctx(rainy))).toHaveLength(1))
  test.each([[22, 1, true], [22, 5, false], [15, 2, true], [15, 1, false], [8, 4, true], [8, 9, false], [7, 7, true], [7, 6, false]])(
    'low %d° with warmth %d → ok %s', (low, warmth, ok) => {
      const gs = [
        { id: 't', name: 'Top', category: 'top', subcategory: 'sweater', warmth },
        { id: 'b', name: 'Bottom', category: 'bottom', subcategory: 'jeans' },
        { id: 's', name: 'Shoes', category: 'shoes', subcategory: 'boots' },
      ].map((g) => ({ ...ctx().garments.get('crew')!, ...g })) as never[]
      const v = weather.check(cand('t', 'b', 's'), ctx({ weather: wx({ tempLowC: low }) }, gs))
      expect(v.length === 0).toBe(ok)
    })
})

describe('availability', () => {
  test('rust tee in the laundry is a violation', () => {
    const v = availability.check(cand('tee', 'jeans', 'sneakers'), ctx())
    expect(v).toHaveLength(1)
    expect(v[0].garmentIds).toEqual(['tee'])
  })
})

describe('runRules', () => {
  test('a valid outfit returns 4 passed results with notes', () => {
    const r = runRules(cand('coat', 'crew', 'trousers', 'boots'),
      ctx({ requiredFormality: 3, events: [event({ title: 'Client review', formality: 3 })], weather: wx({ rainProbability: 80 }) }), dailyRules)
    expect(r.violations).toEqual([])
    expect(r.results).toHaveLength(4)
    for (const res of r.results) { expect(res.passed).toBe(true); expect(res.note.length).toBeGreaterThan(0) }
  })
  test('violations from several rules are collected and their results fail', () => {
    const r = runRules(cand('tee', 'jeans', 'loafers'), ctx({ requiredFormality: 4, weather: wx({ rainProbability: 80 }) }), dailyRules)
    expect(new Set(r.violations.map((v) => v.ruleId))).toEqual(new Set(['formality', 'weather', 'availability']))
    expect(r.results.filter((x) => !x.passed).map((x) => x.ruleId).sort()).toEqual(['availability', 'formality', 'weather'])
  })
})

describe('likedPairs', () => {
  test('scores a candidate holding a remembered pair, and not one holding half of it', async () => {
    const { likedPairs } = await import('@/lib/rules/likedPairs')
    const [a, b, c] = wardrobe.map((g) => g.id)
    const base = ctx()
    const withNotes = { ...base, profile: { ...base.profile, stylistNotes: [{ id: 'n1', text: 'this with that', pieceIds: [a, b] }, { id: 'n2', text: 'navy with olive', pieceIds: [] }] } }
    expect(likedPairs.score!(cand(a, b, c), withNotes)).toBe(1)
    expect(likedPairs.score!(cand(a, c), withNotes)).toBe(0)
    expect(likedPairs.check(cand(a, c), withNotes)).toEqual([])
    expect(likedPairs.note(cand(a, b), withNotes)).toBe('A pairing you like')
  })
})
