import type { Garment } from './types'

type Shape = Pick<Garment, 'category' | 'subcategory'>

/** What a piece occupies on the body: tops layer (tee or polo, then a shirt, then a knit); everything else is one of a kind.
 *  null: as many as you like (accessories, socks). */
export function layer(g: Shape): string | null {
  if (g.category === 'top') return g.subcategory === 'tshirt' ? 'base' : g.subcategory === 'sweater' ? 'knit' : 'shirt'
  return ['bottom', 'shoes', 'outerwear', 'onepiece'].includes(g.category) ? g.category : null
}

const DEPTH: Record<string, number> = { base: 0, onepiece: 0, shirt: 1, knit: 2, outerwear: 3 }
/** The pieces worn on the torso, innermost first (a polo, then the quarter-zip over it) */
export const insideOut = <P extends Shape>(pieces: P[]) =>
  pieces.filter((p) => (layer(p) ?? '') in DEPTH).sort((a, b) => DEPTH[layer(a)!] - DEPTH[layer(b)!])

const SHORT_SAID = /short[- ]?sleeve|sleeveless/i
const LONG_SAID = /long[- ]?sleeve/i
const SHORT = /\btank\b|\bt-?shirt\b|\btee\b/i
const LONG = /sweater|sweatshirt|quarter[- ]?zip|crewneck|cardigan|hoodie|pullover|jacket|coat|overshirt|flannel|oxford/i
/** From the owner's name and tags; null when they don't say (a polo can be either). Saying the sleeve beats the item word. */
export function sleeves(p: Shape & Pick<Garment, 'name' | 'tags'>): 'short' | 'long' | null {
  if (!['top', 'outerwear', 'onepiece'].includes(p.category)) return null
  const words = `${p.name} ${p.tags.join(' ')}`
  if (SHORT_SAID.test(words)) return 'short'
  if (LONG_SAID.test(words)) return 'long'
  if (SHORT.test(words)) return 'short'
  if (LONG.test(words) || p.category === 'outerwear' || p.subcategory === 'sweater') return 'long'
  return null
}
