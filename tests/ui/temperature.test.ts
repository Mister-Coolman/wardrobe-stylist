import { expect, test } from 'vitest'
import { degrees, unitFor, withUnit } from '@/lib/ui/temperature'

test('unitFor: a chosen unit wins; otherwise °F for a US time zone, °C elsewhere', () => {
  expect(unitFor({ tz: 'Europe/London', tempUnit: 'F' })).toBe('F')
  expect(unitFor({ tz: 'America/New_York' })).toBe('F')
  expect(unitFor({ tz: 'America/Indiana/Indianapolis' })).toBe('F')
  expect(unitFor({ tz: 'Pacific/Honolulu' })).toBe('F')
  expect(unitFor({ tz: 'America/Toronto' })).toBe('C')
  expect(unitFor({ tz: 'Asia/Kolkata' })).toBe('C')
})

test('degrees rounds and converts', () => {
  expect(degrees(12.4, 'C')).toBe('12°')
  expect(degrees(12.4, 'F')).toBe('54°')
  expect(degrees(-5, 'F')).toBe('23°')
})

test('withUnit converts every temperature in a note, and leaves °C text alone', () => {
  expect(withUnit('Too light for a low of 8°', 'F')).toBe('Too light for a low of 46°')
  expect(withUnit('Weather: layered for -2° to 10°, rain likely', 'F')).toBe('Weather: layered for 28° to 50°, rain likely')
  expect(withUnit('Too light for a low of 8°', 'C')).toBe('Too light for a low of 8°')
  expect(withUnit('No temperatures here', 'F')).toBe('No temperatures here')
})
