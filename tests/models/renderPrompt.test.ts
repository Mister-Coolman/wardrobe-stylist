import { expect, test } from 'vitest'
import { renderOrder } from '@/lib/models/types'
import { renderPrompt } from '@/lib/models/real/renderer'

const quarterZip = { cutoutUrl: '/qz.png', name: 'Heather blue quarter-zip', category: 'top' as const, subcategory: 'sweater' as const, colors: ['heather blue'], tags: ['cotton', 'quarter zip'], brand: 'Polo Ralph Lauren', fit: 'classic' as const }
const polo = { cutoutUrl: '/polo.png', name: 'Red pique polo', category: 'top' as const, subcategory: 'shirt' as const, colors: ['red'], tags: ['pique'], brand: null, fit: null }
const jeans = { cutoutUrl: '/jeans.png', name: 'Dark indigo jeans', category: 'bottom' as const, subcategory: 'jeans' as const, colors: ['indigo'], tags: ['denim'], brand: null, fit: 'slim' as const }
const boots = { cutoutUrl: '/boots.png', name: 'Black leather boots', category: 'shoes' as const, subcategory: 'boots' as const, colors: ['black'], tags: ['leather'], brand: null, fit: null }

test('flat lay: every image is named with its piece and details, in order; the name decides the colour', () => {
  const p = renderPrompt('flatlay', [quarterZip, polo, jeans])
  expect(p).toContain('exactly 3 pieces')
  expect(p).toContain('Image 1: Heather blue quarter-zip (top; classic fit; Polo Ralph Lauren; cotton, quarter zip)')
  expect(p).toContain('Image 2: Red pique polo (top; pique)')
  expect(p).toContain('Image 3: Dark indigo jeans (bottom; slim fit; denim)')
  expect(p).toMatch(/where a name gives a colour, show that colour/i)
})

test('flat lay: with no shoes it says so and never asks for them', () => {
  const p = renderPrompt('flatlay', [quarterZip, jeans])
  expect(p).toMatch(/no shoes/i)
  expect(p).not.toMatch(/shoes at the bottom/i)
  expect(renderPrompt('flatlay', [quarterZip, jeans, boots])).toMatch(/shoes at the bottom/i)
})

test('flat lay: trousers are laid straight, legs down', () => {
  expect(renderPrompt('flatlay', [quarterZip, jeans])).toMatch(/legs pointing down/i)
})

test('try-on: the person is image 1 and the pieces follow it', () => {
  const p = renderPrompt('tryon', [quarterZip, jeans])
  expect(p).toContain('Image 2: Heather blue quarter-zip')
  expect(p).toContain('Image 3: Dark indigo jeans')
})

test('pieces go outerwear, tops, bottoms, shoes', () => {
  expect(renderOrder([boots, jeans, polo]).map((p) => p.category)).toEqual(['top', 'bottom', 'shoes'])
})

test('mannequin: names every piece, asks for a featureless mannequin, says no shoes when there are none', () => {
  const p = renderPrompt('mannequin', [quarterZip, jeans])
  expect(p).toContain('Image 1: Heather blue quarter-zip (top; classic fit; Polo Ralph Lauren; cotton, quarter zip)')
  expect(p).toContain('Image 2: Dark indigo jeans (bottom; slim fit; denim)')
  expect(p).toMatch(/featureless matte white mannequin \(no face, no hair, no skin\)/)
  expect(p).toContain('exactly these 2 pieces')
  expect(p).toContain('There are no shoes in this outfit: show no shoes.')
  expect(p).toMatch(/where a name gives a colour, show that colour/i)
  expect(renderPrompt('mannequin', [quarterZip, jeans, boots])).not.toMatch(/no shoes/)
})
