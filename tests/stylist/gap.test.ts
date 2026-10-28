import { describe, expect, test } from 'vitest'
import { getModels } from '@/lib/models'
import type { GarmentTags, Stylist } from '@/lib/models'
import { closetGaps, countValidOutfits, REPRESENTATIVE_DAYS } from '@/lib/stylist/gap'
import { day, garment, profile, weather } from '../fixtures/wardrobe'

const rainy = day({ weather: weather({ tempLowC: 16, rainProbability: 80 }), requiredFormality: 2 })
const closet = [
  garment({ id: 'knit', name: 'Oat crewneck', category: 'top', subcategory: 'sweater', formality: 3, warmth: 3 }),
  garment({ id: 'shirt', name: 'Chambray shirt', category: 'top', subcategory: 'shirt', formality: 3, warmth: 2 }),
  garment({ id: 'jeans', name: 'Selvedge jeans', category: 'bottom', subcategory: 'jeans', formality: 2, warmth: 2 }),
  garment({ id: 'suede', name: 'Suede loafers', category: 'shoes', subcategory: 'dress_shoes', colors: ['brown'], formality: 4, rainSafe: false }),
]
const tags = (p: Partial<GarmentTags> & Pick<GarmentTags, 'name' | 'category' | 'subcategory'>): GarmentTags =>
  ({ colors: [], pattern: 'solid', formality: 3, warmth: 1, rainSafe: true, tags: [], ...p })
const boots = tags({ name: 'Black leather boots', category: 'shoes', subcategory: 'boots', colors: ['black'] })
const sameLoafers = tags({ name: 'Suede loafers', category: 'shoes', subcategory: 'dress_shoes', colors: ['brown'], formality: 4, rainSafe: false })
const stylist = (items: GarmentTags[]): Stylist => ({ ...getModels().stylist, suggestGaps: async () => items })
const noProduct = async () => null

describe('countValidOutfits', () => {
  test('rain-unsafe shoes on a rainy day → no valid outfits', () => expect(countValidOutfits(closet, rainy, profile)).toBe(0))
  test('dry casual day counts top × bottom × shoes that pass', () => {
    expect(countValidOutfits(closet, day({ weather: weather({ tempLowC: 16 }), requiredFormality: 2 }), profile)).toBe(2)
  })
  test('identical pieces do not count twice', () => {
    const twin = garment({ ...closet[3], id: 'suede2' })
    const dry = day({ weather: weather({ tempLowC: 16 }) })
    expect(countValidOutfits([...closet, twin], dry, profile)).toBe(countValidOutfits(closet, dry, profile))
  })
})

describe('closetGaps', () => {
  test('rain-safe boots rank first and unlock outfits', async () => {
    const g = await closetGaps({ wardrobe: closet, profile, stylist: stylist([sameLoafers, boots]), days: [rainy], productSearch: noProduct })
    expect(g?.item.name).toBe('Black leather boots')
    expect(g!.newOutfits).toBeGreaterThan(0)
  })
  test('an item identical to one you own adds nothing → null', async () => {
    expect(await closetGaps({ wardrobe: closet, profile, stylist: stylist([sameLoafers]), days: [rainy], productSearch: noProduct })).toBeNull()
  })
  test('the product search result is attached', async () => {
    const g = await closetGaps({ wardrobe: closet, profile, stylist: stylist([boots]), days: [rainy], productSearch: async (i) => ({ title: i.name, url: 'https://shop.example/boots' }) })
    expect(g?.product?.url).toBe('https://shop.example/boots')
  })
  test('three representative days: smart/dry, casual/rain, casual/cold', () => {
    expect(REPRESENTATIVE_DAYS('2026-10-27').map((d) => [d.requiredFormality, d.weather.rainProbability >= 50, d.weather.tempLowC < 8]))
      .toEqual([[4, false, false], [2, true, false], [2, false, true]])
  })
})

test('ties go to the piece that matches the style profile', async () => {
  const navyBoots = tags({ name: 'Navy suede-free boots', category: 'shoes', subcategory: 'boots', colors: ['navy'] })
  const styled = { ...profile, styleProfile: { summary: '', traits: [], palette: ['navy'], avoid: [], sourceImages: [] } }
  const g = await closetGaps({ wardrobe: closet, profile: styled, stylist: stylist([boots, navyBoots]), days: [rainy], productSearch: noProduct })
  expect(g?.item.name).toBe('Navy suede-free boots')
})
