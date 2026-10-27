import { expect, test } from 'vitest'
// @ts-expect-error — plain ESM script without types
import { scan } from '../scripts/check-slop.mjs'

test('flags banned patterns', () => {
  for (const bad of ['bg-gradient-to-r', 'from-purple-500', 'font-family: Inter', '#ffffff', 'shadow-lg', 'rounded-2xl', 'transition-all', 'animate-bounce', 'Sparkles', 'Get started', 'lorem'])
    expect(scan(`<div className="${bad}">`), bad).not.toHaveLength(0)
})

test('passes clean markup', () => expect(scan('<div className="bg-paper text-ink">')).toEqual([]))

test('reports the line number of a hit', () => {
  expect(scan('ok\n<div className="shadow-xl">')).toEqual([{ pattern: 'shadow-xl', line: 2 }])
})

test('exempts a line with a slop-ok reason', () => {
  expect(scan('<div className="backdrop-blur"> {/* slop-ok: bottom nav is the one glass use */}')).toEqual([])
})
