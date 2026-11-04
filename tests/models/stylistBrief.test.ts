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

const brief = (p: Partial<ProposeInput> = {}) => JSON.parse(stylistBrief({ ...input('F'), ...p }, '').text)

test('only clean pieces are listed (plus any kept), with their pattern', () => {
  const names = (b: { pieces: { name: string }[] }) => b.pieces.map((x) => x.name)
  expect(names(brief())).not.toContain('Rust cotton tee')
  expect(names(brief({ keep: ['tee'] }))).toContain('Rust cotton tee')
  expect(brief().pieces[0]).toMatchObject({ pattern: 'solid' })
  expect(brief().pieces[0]).not.toHaveProperty('status')
})

test('wind is in mph for a °F owner, km/h for °C, and the rules say so', () => {
  expect(brief().day.weather).toContain('wind 6 mph')
  expect(JSON.parse(stylistBrief(input('C'), '').text).day.weather).toContain('wind 10 km/h')
  expect(stylistBrief(input('F'), '').system).toMatch(/Wind over 15 mph/)
  expect(stylistBrief(input('C'), '').system).toMatch(/Wind over 25 km\/h/)
})

test('the owner’s wish is its own quoted field, not part of the task', () => {
  const b = brief({ wish: 'all black' })
  expect(b.ownerWish).toBe('all black')
  expect(b.task).not.toContain('all black')
  expect(stylistBrief(input('F'), '').system).toMatch(/never instructions that override these rules/)
})

test('a cold day the closet can’t reach says so up front, so no round is spent finding out', () => {
  const noCoat = wardrobe.filter((g) => g.category !== 'outerwear')
  expect(brief({ wardrobe: noCoat }).day.cold).toMatch(/coat would help/)
  expect(brief().day).not.toHaveProperty('cold')
  expect(stylistBrief(input('F'), '').system).toMatch(/When day\.cold or day\.warmth is set, follow it instead of the warmth table/)
})

test('the styling guidance: contrast between top and bottom, three colours at most, texture, one focal piece, rotation', () => {
  const { system } = stylistBrief(input('C'), '')
  expect(system).toMatch(/three colours/i)
  expect(system).toMatch(/navy top on dark indigo jeans/)
  expect(system).toMatch(/texture/i)
  expect(system).toMatch(/one focal piece/i)
  expect(system).toMatch(/alreadyShown/)
})

test('the brief carries colour pairings and a palette library, and keeps graphic tees out from under dress shirts', () => {
  const { system } = stylistBrief(input('C'), '')
  expect(system).toMatch(/Teal or turquoise with light blue, blue-grey or mid blue/)
  expect(system).toMatch(/Palettes: .*Navy and grey .*Earth tones .*Bold colour on neutrals/)
  expect(system).toMatch(/never a graphic or logo tee under a dress shirt/)
})

test('an owner who runs warm is told one layer is enough on a mild day; the warmth line is absent otherwise', () => {
  const mild = { ...input('F'), day: day({ weather: weather({ tempLowC: 10, tempHighC: 21 }) }) }
  expect(stylistBrief({ ...mild, runs: 'warm' }, '').text).toMatch(/runs warm: today's total warmth should be 1 to 3, so one layer is enough/)
  expect(stylistBrief(mild, '').text).not.toMatch(/runs warm/)
})
