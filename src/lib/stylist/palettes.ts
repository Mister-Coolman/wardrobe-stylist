// Colour guidance for the stylist brief, from menswear colour guides (FashionBeans' four key palettes, Real Men Real
// Style's three-colour outfits, and the common advice that close-but-not-matching shades read as a mistake). The owner
// called a teal shirt over a blue-grey tee a poor pairing; the near-miss line is for that.

export interface Palette { name: string; colours: string; use: string }

/** Palettes a look can be built on; each names its colours and how they share the look */
export const PALETTES: Palette[] = [
  { name: 'Navy and grey', colours: 'navy, grey or charcoal, white', use: 'navy or grey leads, white lifts it; burgundy or red as a small accent' },
  { name: 'Red, white and blue', colours: 'navy, red or burgundy, white or cream', use: 'navy leads in cold months, white in warm; red is the one accent' },
  { name: 'Earth tones', colours: 'brown, tan, olive or forest green, cream, warm grey', use: 'one leads, one supports, cream or white lifts; burnt orange, mustard or burgundy as an accent' },
  { name: 'Khaki and denim', colours: 'khaki or tan, white or cream, denim blue', use: 'tan chinos with a white tee or shirt and denim as the outer layer, or the reverse' },
  { name: 'Olive, tan and light blue', colours: 'olive, tan or khaki, light blue', use: 'a light blue shirt between an olive layer and tan trousers' },
  { name: 'Forest and cream', colours: 'forest or dark green, cream, brown', use: 'green knit or shirt, cream or brown trousers' },
  { name: 'Black and camel', colours: 'black, camel or tan, grey', use: 'black top, camel or grey around it' },
  { name: 'Greyscale', colours: 'black, white, light to charcoal greys', use: 'clearly different depths, with texture (knit, fleece, denim) so it isn’t flat' },
  { name: 'Tonal blue', colours: 'navy, mid blue, light blue', use: 'clearly stepped from dark to light, on a neutral bottom (tan, grey, cream)' },
  { name: 'White and pastels', colours: 'white or stone, at most two pastels (light blue, pink, mint, lilac)', use: 'warm weather only; white leads' },
  { name: 'Bold colour on neutrals', colours: 'one of teal, red, burgundy, rust, mustard or green, with tan, cream, grey, white or navy', use: 'the bold piece is the focal point; everything around it plain and neutral' },
]

/** Pairing rules the guides agree on, beyond "three colours at most" */
export const PAIRINGS = [
  'Close-but-not-matching shades read as a mistake: two blues, two greens or two greys a little apart, or black with navy. Teal or turquoise with light blue, blue-grey or mid blue; navy with indigo; olive with khaki. Match a shade on purpose, step clearly from dark to light, or switch colour family.',
  'Teal, turquoise and other bold blue-greens go with warm neutrals (tan, khaki, cream, brown), grey, white or navy; keep other light or mid blues away from them.',
  'Warm colours (brown, tan, rust, olive, cream, burgundy) sit best together, and cool ones (navy, grey, light blue, white, black) together; a neutral bridges the two.',
]

export const colourGuide = () =>
  `Pairings: ${PAIRINGS.join(' ')}\nPalettes: prefer looks that sit in one of these (name, colours, how they share the look): ${PALETTES.map((p) => `${p.name} (${p.colours}: ${p.use})`).join('; ')}.`
