import { expect, test } from 'vitest'
import { stylistBrief } from '@/lib/models/real/stylist'
import type { ProposeInput } from '@/lib/models/types'
import { day, wardrobe, weather } from '../fixtures/wardrobe'

const input = (unit: 'F' | 'C'): ProposeInput => ({ day: day({ weather: weather({ tempLowC: 4, tempHighC: 14 }) }), wardrobe, count: 3, unit })

test('°F owner: the weather and the warmth thresholds the model sees are in °F, every temperature labelled', () => {
  const { system, text } = stylistBrief(input('F'), '')
  expect(JSON.parse(text).day.weather).toMatch(/^39°F to 57°F/)
  expect(system).toContain('under 46°F → 7+')
  expect(`${system}${text}`).not.toMatch(/\d°(?![CF])/)
})

test('°C owner: the same, in °C', () => {
  const { system, text } = stylistBrief(input('C'), '')
  expect(JSON.parse(text).day.weather).toMatch(/^4°C to 14°C/)
  expect(system).toContain('under 8°C → 7+')
})

test('reasons are asked for in plain words, never warmth points or levels', () => {
  const { system } = stylistBrief(input('F'), '')
  expect(system).toMatch(/plain words/)
  expect(system).toMatch(/never mention warmth points, dress-code levels/i)
})

test('rejection reasons sent back on a revision are in the owner’s unit', () => {
  const { text } = stylistBrief(input('F'), ' These were rejected: Too light for a low of 4°')
  expect(JSON.parse(text).task).toContain('Too light for a low of 39°F')
})
