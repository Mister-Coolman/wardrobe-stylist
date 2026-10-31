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
  expect(p).toContain('Image 1: Heather blue quarter-zip (top; long sleeves; classic fit; cotton, quarter zip)')
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
  expect(p).toContain('Image 1: Heather blue quarter-zip (top; long sleeves; classic fit; cotton, quarter zip)')
  expect(p).toContain('Image 2: Dark indigo jeans (bottom; slim fit; denim)')
  expect(p).toMatch(/featureless matte white mannequin \(no face, no hair, no skin\)/)
  expect(p).toContain('exactly these 2 pieces')
  expect(p).toContain('There are no shoes in this outfit: show no shoes.')
  expect(p).toMatch(/where a name gives a colour, show that colour/i)
  expect(renderPrompt('mannequin', [quarterZip, jeans, boots])).not.toMatch(/no shoes/)
})

const redPolo = { cutoutUrl: '/red.png', name: 'Red cotton polo shirt', category: 'top' as const, subcategory: 'tshirt' as const, colors: ['red'], tags: ['cotton', 'polo', 'short-sleeve'], brand: null, fit: null }

test('mannequin and try-on: layers inside to outside with sleeve lengths; a short-sleeved layer under long sleeves shows no cuffs', () => {
  for (const mode of ['mannequin', 'tryon'] as const) {
    // given in either order, the polo is worn under the quarter-zip
    const p = renderPrompt(mode, [quarterZip, redPolo, jeans])
    expect(p).toContain('Worn inside to outside: Red cotton polo shirt (short sleeves), then Heather blue quarter-zip (long sleeves).')
    expect(p).toMatch(/Red cotton polo shirt is short-sleeved and under long sleeves: only its collar shows.*no red.*cuffs/i)
  }
})

test('sleeve length goes in each piece’s details, from its tags or name', () => {
  const p = renderPrompt('flatlay', [quarterZip, redPolo])
  expect(p).toContain('Image 1: Heather blue quarter-zip (top; long sleeves;')
  expect(p).toContain('Image 2: Red cotton polo shirt (top; short sleeves;')
})

test('a single top says nothing about layering', () => {
  expect(renderPrompt('mannequin', [redPolo, jeans])).not.toMatch(/inside to outside|only its collar/)
})

test('brand reaches the prompt only as a logo the tags mention; no added text', () => {
  expect(renderPrompt('flatlay', [quarterZip])).not.toContain('Polo Ralph Lauren')
  const logo = { ...quarterZip, tags: ['cotton', 'embroidered logo'] }
  expect(renderPrompt('mannequin', [logo, jeans])).toContain('(top; long sleeves; classic fit; logo: Polo Ralph Lauren; cotton, embroidered logo)')
  for (const mode of ['flatlay', 'mannequin', 'tryon'] as const) expect(renderPrompt(mode, [quarterZip, jeans])).toMatch(/no added text or captions, and no readable lettering on labels/i)
})

const oxford = { cutoutUrl: '/ox.png', name: 'White oxford shirt', category: 'top' as const, subcategory: 'shirt' as const, colors: ['white'], tags: ['button-down collar'], brand: null, fit: null }
const coat = { cutoutUrl: '/coat.png', name: 'Navy wool overcoat', category: 'outerwear' as const, subcategory: 'coat' as const, colors: ['navy'], tags: ['wool'], brand: null, fit: null }

test('mannequin and try-on: collars out over the knit, the shirt tucked or a short hem, outerwear open', () => {
  for (const mode of ['mannequin', 'tryon'] as const) {
    const p = renderPrompt(mode, [coat, quarterZip, oxford, jeans])
    expect(p).toMatch(/collars of the shirts and polos under Heather blue quarter-zip sit outside its neckline/i)
    expect(p).toMatch(/White oxford shirt is tucked in or shows a short hem/)
    expect(p).toMatch(/Navy wool overcoat is worn open so the layers show/)
  }
  expect(renderPrompt('mannequin', [quarterZip, jeans])).not.toMatch(/neckline|worn open/)
})

test('mannequin build suits the clothes; try-on replaces all their clothes', () => {
  expect(renderPrompt('mannequin', [quarterZip, jeans])).toMatch(/with a build that suits these clothes/)
  const t = renderPrompt('tryon', [quarterZip, jeans])
  expect(t).toMatch(/Replace all of the clothes they are wearing/)
  expect(t).toMatch(/Keep the shoes they are already wearing/)
})

test('flat lay: layered tops are nested as worn, only the inner collar and hem showing; trousers stay off the knit; shoes as a pair', () => {
  const p = renderPrompt('flatlay', [quarterZip, oxford, jeans, boots])
  expect(p).toContain(`${oxford.name} under Heather blue quarter-zip, showing only its collar at the neckline and a strip of hem below it, not laid out on its own`)
  expect(p).toMatch(/waistband just under the hem without covering it/)
  expect(p).toMatch(/shoes at the bottom as a pair/)
  expect(renderPrompt('flatlay', [quarterZip, jeans])).not.toMatch(/nested/)
})

test('an explicit sleeve tag wins over the item word: a long sleeve tee is long-sleeved', async () => {
  const { sleeves } = await import('@/lib/domain/layers')
  const tee = { name: 'Black long sleeve tee', category: 'top' as const, subcategory: 'tshirt' as const, tags: ['cotton'] }
  expect(sleeves(tee)).toBe('long')
  expect(sleeves({ ...tee, name: 'Black tee', tags: ['long-sleeve'] })).toBe('long')
  expect(sleeves({ ...tee, name: 'Grey quarter-zip', subcategory: 'sweater', tags: ['short sleeve'] })).toBe('short')
  expect(sleeves({ ...tee, name: 'Black tee', tags: [] })).toBe('short')
})
