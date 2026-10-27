import { describe, expect, test } from 'vitest'
import { DEFAULT_WEAR_LIMITS, limitFor } from '@/lib/domain/wearLimits'
import type { Garment } from '@/lib/domain/types'

const g = (p: Partial<Garment>): Garment => ({
  id: 'g', userId: 'u', name: 'x', category: 'top', subcategory: 'tshirt', colors: [], pattern: 'solid',
  formality: 2, warmth: 2, rainSafe: true, tags: [], status: 'clean', wearLimitOverride: null,
  wearsSinceWash: 0, wearCount: 0, lastWornAt: null, cutoutUrl: '', photoUrl: '', confirmed: true, ...p,
})

describe('limitFor', () => {
  test.each([
    ['top', 'tshirt', 1], ['bottom', 'jeans', 5], ['top', 'dress_shirt', 2], ['top', 'sweater', 3],
    ['bottom', 'trousers', 3], ['bottom', 'sweatpants', 1], ['bottom', 'athletic', 1],
  ] as const)('%s/%s → %d', (category, subcategory, n) => {
    expect(limitFor(g({ category, subcategory }), DEFAULT_WEAR_LIMITS)).toBe(n)
  })
  test('socks and underwear are single wear', () => {
    expect(limitFor(g({ category: 'socks', subcategory: 'other' }), DEFAULT_WEAR_LIMITS)).toBe(1)
    expect(limitFor(g({ category: 'underwear', subcategory: 'other' }), DEFAULT_WEAR_LIMITS)).toBe(1)
  })
  test('coat, shoes and accessories are unlimited', () => {
    expect(limitFor(g({ category: 'outerwear', subcategory: 'coat' }), DEFAULT_WEAR_LIMITS)).toBeNull()
    expect(limitFor(g({ category: 'shoes', subcategory: 'boots' }), DEFAULT_WEAR_LIMITS)).toBeNull()
    expect(limitFor(g({ category: 'accessory', subcategory: 'other' }), DEFAULT_WEAR_LIMITS)).toBeNull()
  })
  test('garment override beats everything', () => {
    expect(limitFor(g({ category: 'bottom', subcategory: 'jeans', wearLimitOverride: 2 }), DEFAULT_WEAR_LIMITS)).toBe(2)
  })
  test('user limit overrides the default', () => {
    expect(limitFor(g({ category: 'bottom', subcategory: 'jeans' }), { ...DEFAULT_WEAR_LIMITS, jeans: 3 })).toBe(3)
  })
  test('subcategory beats category; unknown subcategory falls back to category', () => {
    expect(limitFor(g({ category: 'top', subcategory: 'other' }), { top: 2 })).toBe(2)
  })
})
