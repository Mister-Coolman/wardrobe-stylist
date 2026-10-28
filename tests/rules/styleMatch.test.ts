import { describe, expect, test } from 'vitest'
import { dailyRules, runRules } from '@/lib/rules/registry'
import { styleMatch } from '@/lib/rules/styleMatch'
import type { StyleProfile } from '@/lib/domain/types'
import { cand, ctx, garment, profile } from '../fixtures/wardrobe'

const style: StyleProfile = { summary: 'Quiet neutrals', traits: ['wool'], palette: ['navy', 'oat'], avoid: ['logo'], sourceImages: [] }
const gs = [
  garment({ id: 'navyCoat', name: 'Navy coat', category: 'outerwear', subcategory: 'coat', colors: ['navy'], tags: ['wool'], warmth: 4, formality: 4 }),
  garment({ id: 'oatKnit', name: 'Oat knit', category: 'top', subcategory: 'sweater', colors: ['oat'], warmth: 3, formality: 3 }),
  garment({ id: 'rustTee', name: 'Rust tee', category: 'top', subcategory: 'tshirt', colors: ['rust'], warmth: 2 }),
  garment({ id: 'oliveCoat', name: 'Olive coat', category: 'outerwear', subcategory: 'jacket', colors: ['olive'], warmth: 3 }),
  garment({ id: 'logoTee', name: 'Logo tee', category: 'top', subcategory: 'tshirt', colors: ['navy'], tags: ['logo'], warmth: 2 }),
  garment({ id: 'jeans', name: 'Jeans', category: 'bottom', subcategory: 'jeans', colors: ['indigo'], formality: 2 }),
  garment({ id: 'boots', name: 'Boots', category: 'shoes', subcategory: 'boots', colors: ['black'], formality: 3 }),
]
const c = { ...ctx({}, gs), profile: { ...profile, styleProfile: style } }

describe('styleMatch', () => {
  test('navy/oat outfit scores above rust/olive', () => {
    expect(styleMatch.score!(cand('navyCoat', 'oatKnit', 'jeans', 'boots'), c)).toBeGreaterThan(styleMatch.score!(cand('oliveCoat', 'rustTee', 'jeans', 'boots'), c))
  })
  test('an avoided tag lowers the score', () => {
    expect(styleMatch.score!(cand('logoTee', 'jeans', 'boots'), c)).toBeLessThan(styleMatch.score!(cand('oatKnit', 'jeans', 'boots'), c))
  })
  test('score is clamped to 0–1 and 0 without a profile', () => {
    expect(styleMatch.score!(cand('logoTee', 'jeans', 'boots'), { ...c, profile: { ...profile, styleProfile: { ...style, palette: [], avoid: ['logo', 'indigo', 'black'] } } })).toBe(0)
    expect(styleMatch.score!(cand('navyCoat', 'oatKnit'), c)).toBeLessThanOrEqual(1)
    expect(styleMatch.score!(cand('navyCoat', 'oatKnit'), ctx({}, gs))).toBe(0)
  })
  test('soft only: a hard violation still rejects a high-style outfit', () => {
    const r = runRules(cand('navyCoat', 'oatKnit'), c, [...dailyRules, styleMatch])   // no bottom, no shoes
    expect(r.violations.length).toBeGreaterThan(0)
    expect(r.softScore).toBeGreaterThan(0)
    expect(styleMatch.kind).toBe('soft')
  })
})
