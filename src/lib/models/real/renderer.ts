// muse-image-1.0 via POST /v1/images/edits (JSON body, 1–10 input images, b64_json out).
// The model redraws what it's given, so the prompt names every image with its piece: a colour left only to the
// picture drifts (heather blue came back grey), and a fixed layout line asking for shoes made it invent a pair.
import sharp from 'sharp'
import { insideOut, layer, sleeves } from '@/lib/domain/layers'
import { RENDER_CALL_MS, RENDER_TIMEOUT_MS } from '../types'
import { renderOrder } from '../types'
import type { Renderer, RenderPiece } from '../types'
import type { RenderMode } from '@/lib/domain/types'
import { metaFetch, toDataUrl } from './client'
import { better, contentProblems, framingProblem, split, type Checked } from './renderCheck'

// colours come from the name: the owner may have corrected it ("Heather blue…") while the tagged colours still say grey.
// A brand on its own invites printed lettering, so it goes in only as the logo the tags say is there.
const logo = (p: RenderPiece) => p.brand && p.tags.some((t) => /logo/i.test(t)) ? `logo: ${p.brand}` : null
const SHADE = /\b(?:(?:light|dark|pale|deep|bright|heather|burma|forest|royal|sky|olive|charcoal|navy|stone)\s+)?(?:black|white|cream|ivory|gr[ae]y|charcoal|navy|blue|indigo|green|olive|red|burgundy|maroon|pink|purple|yellow|orange|brown|tan|beige|camel|khaki|stone|sand)\b/gi
/** The colour to draw, spelled out: the name's colour words (corrected by the owner) over the tags. "Khaki" in a name is the
 *  trouser style when another colour is named: "Burma Grey … Khaki Stretch Pants" came back beige. */
export function colour(p: RenderPiece): string | null {
  const said = p.name.match(SHADE) ?? []
  return said.find((w) => !/^khaki$/i.test(w)) ?? said[0] ?? (p.colors.join(' and ') || null)
}
/** Tags without the brand: a "Dockers" tag came back as a DOCKERS patch on the waistband, a label the photo doesn't show */
const details = (p: RenderPiece) => {
  const brand = (p.brand ?? '').toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  return p.tags.filter((t) => !brand.some((w) => t.toLowerCase().includes(w))).join(', ')
}
const describe = (p: RenderPiece) => [p.category, colour(p) && `colour: ${colour(p)}`, sleeves(p) && `${sleeves(p)} sleeves`, p.fit && `${p.fit} fit`, logo(p), details(p)].filter(Boolean).join('; ')

/** On a body, what goes over what: left to guess, the model gave a short-sleeved polo long red cuffs under a quarter-zip. */
function worn(pieces: RenderPiece[]): string {
  const layers = insideOut(pieces)
  if (layers.length < 2) return ''
  const named = (p: RenderPiece) => `${p.name}${sleeves(p) ? ` (${sleeves(p)} sleeves)` : ''}`
  const lines = [`Worn inside to outside: ${layers.map(named).join(', then ')}.`]
  layers.forEach((p, i) => {
    if (sleeves(p) === 'short' && layers.slice(i + 1).some((o) => sleeves(o) === 'long'))
      lines.push(`${p.name} is short-sleeved and under long sleeves: only its collar shows at the neck — no ${p.colors[0] ? `${p.colors[0]} ` : ''}sleeves or cuffs at the wrists.`)
  })
  const knit = layers.find((p) => layer(p) === 'knit')
  const under = knit ? layers.slice(0, layers.indexOf(knit)) : []
  if (knit && under.some((p) => layer(p) === 'shirt' || /polo|collar/i.test(`${p.name} ${p.tags.join(' ')}`)))
    lines.push(`Collars of the shirts and polos under ${knit.name} sit outside its neckline.`)
  for (const p of under.filter((p) => layer(p) === 'shirt')) lines.push(`${p.name} is tucked in or shows a short hem below the knit.`)
  const outer = layers.find((p) => layer(p) === 'outerwear')
  if (outer) lines.push(`${outer.name} is worn open so the layers show.`)
  const shirt = openShirt(layers)
  if (shirt) lines.push(`${shirt.name} is worn unbuttoned and open over ${layers[0].name}, the tee's front and any print on it showing between the shirt's fronts.`)
  return `\n${lines.join(' ')}`
}

/** A button shirt worn as the outer layer over a tee is worn open: buttoned, it hid the graphic the look was built
 *  around, and the tee showed only as a strip of hem. */
function openShirt(torso: RenderPiece[]): RenderPiece | null {
  const outer = torso.at(-1)
  return outer && torso.length > 1 && layer(outer) === 'shirt' && torso.slice(0, -1).every((p) => layer(p) === 'base') ? outer : null
}

/** Where each piece lies. Left at "overlap slightly", the model laid a polo out whole above the quarter-zip and the trousers' waistband across the knit;
 *  nested but with nothing said about sleeves, the polo's short sleeves stuck out past the quarter-zip's shoulders. */
function layout(pieces: RenderPiece[]): string {
  const has = (c: string) => pieces.some((p) => p.category === c)
  const torso = insideOut(pieces)
  const outer = torso.at(-1)
  const inner = torso.slice(0, -1).map((p) => p.name)
  // asked for a strip of hem, the model slid a chest print down into it so it would show; with the hem tucked away it
  // left the whole tee out (2 of 2 drawings, caught by the check), so the hem shows and is said to be plain
  const printed = torso.slice(0, -1).some((p) => /graphic|print/i.test(`${p.name} ${p.tags.join(' ')}`))
  const tops = outer && inner.length && openShirt(torso)
    ? `the tops nested as they are worn: ${inner.join(' and ')} under ${outer.name}, which lies unbuttoned and open, its two fronts parted down the middle with the tee's front and its print showing between them, the tee's sleeves folded out of sight under ${outer.name}`
    : outer && inner.length
    ? `the tops nested as they are worn, as a stylist would lay them: ${inner.join(' and ')} under ${outer.name}, showing only ${inner.length > 1 ? 'their collars' : 'its collar'} at the neckline${printed ? ' and a strip of its plain hem below it, its print staying on the chest, covered' : ' and a strip of hem below it'}, not laid out on ${inner.length > 1 ? 'their' : 'its'} own, ${inner.length > 1 ? 'their' : 'its'} sleeves folded out of sight under ${outer.name}: none showing past its shoulders${layer(outer) === 'outerwear' ? `; ${outer.name} lies open` : ''}`
    : (has('top') || has('outerwear') || has('onepiece')) && 'the top across the top'
  const rows = [tops, has('bottom') && `bottoms below, the waistband just under the hem without covering it, laid straight with the legs pointing down${pieces.some((p) => p.category === 'bottom' && /stripe/i.test(`${p.name} ${p.tags.join(' ')}`)) ? '' : ', each leg one even colour from waistband to hem, the outside seams the same colour as the legs'}`,
    has('shoes') && 'shoes at the bottom as a pair', has('accessory') && 'accessories to the side']
  return `Lay them out: ${rows.filter(Boolean).join(', ')}.${has('shoes') ? '' : ' There are no shoes in this outfit: show no shoes.'}`
}

// A real label in the photo (IZOD) came back as made-up letters ("LEOD"). Naming the label at all draws one: "show no neck
// labels" and "a blank neck label" both came back lettered (a TOMMY HILFIGER label inside a plain shirt), so the neckline
// is described as what it should be, without the word.
const NO_TEXT = 'Inside every neckline is plain fabric, and waistbands are plain. No added text or captions.'

const noShoes = (pieces: RenderPiece[]) => pieces.some((p) => p.category === 'shoes') ? '' : ' There are no shoes in this outfit: show no shoes.'

/** The instruction for one outfit. In a try-on the person is image 1, so the pieces start at image 2. */
export function renderPrompt(mode: 'tryon' | 'mannequin' | 'flatlay', pieces: RenderPiece[]): string {
  const first = mode === 'tryon' ? 2 : 1
  const list = renderOrder(pieces).map((p, i) => `Image ${i + first}: ${p.name} (${describe(p)})`).join('\n')
  const keep = [
    'Each image shows one garment cut out of a photo: any scrap of bed, wall or floor left at its edges is not part of the garment.',
    `The names are the owner's own descriptions. Copy each piece as named and photographed: its sleeve length, collar, buttons, fabric, and every print and logo exactly where it sits on the piece. A print on a layer that another piece covers stays hidden under it.`,
    'Show each piece in its given colour, in neutral daylight, even if the photo\'s lighting makes it look different. Draw each piece exactly once. Do not restyle or swap anything.',
  ].join(' ')
  if (mode === 'tryon') {
    return `Image 1 is a person. Dress this exact person in exactly these ${pieces.length} pieces, keeping their face, body and pose:\n${list}${worn(pieces)}\n${keep} Replace all of the clothes they are wearing.${pieces.some((p) => p.category === 'shoes') ? '' : ' Keep the shoes they are already wearing.'} Full-length photo with the whole person inside the frame and space above the head and below the feet, plain light background, natural light. ${NO_TEXT}`
  }
  if (mode === 'mannequin') {
    return `A full-length studio photograph of a featureless matte white mannequin (no face, no hair, no skin) with a build that suits these clothes, standing on a plain light background, dressed in exactly these ${pieces.length} pieces:\n${list}${worn(pieces)}\n${keep}${noShoes(pieces)} Camera straight on at waist height, the whole mannequin inside the frame with space above its head and below its feet. ${NO_TEXT}`
  }
  return `An overhead flat-lay photograph of exactly ${pieces.length} pieces, one per input image, on warm off-white paper (#E9E5DC), evenly lit, soft natural shadows:\n${list}\n${keep}\n${layout(pieces)} Shot from far enough away that the whole outfit fits, from the top of the collar to the trouser hems or shoes, with bare paper showing on all four sides: nothing cut off at an edge. Nothing else in frame: no people, props or extra clothing. ${NO_TEXT}`
}

/** Flat lays are drawn at 2:3 and given paper at the sides back to 4:5. The model fills about 94% of the frame's height
 *  whatever it's told, and at 4:5 that cut the trouser hems off in about one flat lay in four; a taller frame leaves them room. */
const TALL = '1024x1536'
const FRAME = 4 / 5

/** Paper added at both sides until the picture is 4:5. Each side is its picture edge carried outwards: a strip averaged
 *  across and smoothed down, so the paper's shading continues (one flat colour left a visible seam). */
export async function toFrame(jpg: Buffer): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(jpg).metadata()
  const extra = Math.round(height * FRAME) - width
  if (extra <= 0) return jpg
  const side = async (left: number, w: number) => sharp(await sharp(jpg).extract({ left, top: 0, width: 16, height }).resize(1, height, { fit: 'fill' }).blur(6).toBuffer())
    .resize(w, height, { fit: 'fill', kernel: 'nearest' }).toBuffer()
  const l = Math.floor(extra / 2), r = Math.ceil(extra / 2)
  return sharp(jpg).extend({ left: l, right: r, top: 0, bottom: 0, background: '#E9E5DC' })
    .composite([{ input: await side(0, l), left: 0, top: 0 }, { input: await side(width - 16, r), left: l + width, top: 0 }])
    .jpeg({ quality: 90 }).toBuffer()
}

/** One drawing from Muse Image */
async function drawOnce({ mode, pieces, personPhotoUrl }: Parameters<Renderer['render']>[0]): Promise<{ url: string }> {
  const view = mode === 'tryon' && !personPhotoUrl ? 'flatlay' : mode
  const ordered = renderOrder(pieces)
  const person = mode === 'tryon' && personPhotoUrl ? [await toDataUrl(personPhotoUrl, 1024)] : []
  // cutouts go as transparent PNGs: put on white, each piece filled its image and the model drew them bigger, cropping the trousers
  const images = [...person, ...await Promise.all(ordered.map((p) => toDataUrl(p.cutoutUrl, 1024)))].slice(0, 10).map((u) => ({ image_url: u }))
  const res = await metaFetch('renderer', '/images/edits', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'muse-image-1.0', prompt: renderPrompt(mode === 'tryon' && !personPhotoUrl ? 'flatlay' : mode, ordered), images, n: 1,
      // high (several passes, same price) cropped as many trousers as low in a before/after on 8 flat lays, and is slower. Searching would bring in outside pictures.
      size: view === 'flatlay' ? TALL : '1024x1280', output_format: 'jpeg', reasoning_strength: 'low',
      tool_enablement: { enable_web_search: false, enable_image_search: false, enable_shell: false } }),
  }, RENDER_CALL_MS)
  const j = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
  const d = j.data?.[0]
  if (d?.b64_json) {
    const jpg = Buffer.from(d.b64_json, 'base64')
    return { url: `data:image/jpeg;base64,${(view === 'flatlay' ? await toFrame(jpg) : jpg).toString('base64')}` }
  }
  if (d?.url) return { url: d.url }
  throw new Error('no image in response')
}

/** What's wrong with a drawing. A check that fails itself passes the drawing: checking never costs the owner a picture. */
async function check(url: string, pieces: RenderPiece[], mode: Exclude<RenderMode, 'none'>): Promise<Checked> {
  const m = url.match(/^data:image\/\w+;base64,(.*)$/)
  if (!m) return { url, redraw: [], minor: [] }
  const [frame, content] = await Promise.all([
    framingProblem(Buffer.from(m[1], 'base64'), mode === 'flatlay').catch(() => null),
    contentProblems(url, pieces, colour).catch(() => []),
  ])
  return { url, ...split([...(frame ? [frame] : []), ...content]) }
}

function logged(pick: Checked, all: Checked[]) {
  console.info('render check', JSON.stringify(all.map((d) => ({ picked: d === pick, redraw: d.redraw, minor: d.minor }))))
  return { url: pick.url }
}

/** A redraw is only started while there's time for it inside the render's budget */
const REDRAW_IF_UNDER_MS = RENDER_TIMEOUT_MS - RENDER_CALL_MS - 20_000

export const realRenderer: Renderer = {
  /** Draws, checks, and on a problem a second drawing usually fixes (cropped, a piece missing or doubled, a wrong colour)
   *  draws once more and keeps the better. Measured on 15 pictures: the checks caught every crop, the doubled fleece and
   *  the made-up label; each takes 4–6 s. */
  async render(req) {
    const started = Date.now()
    const pieces = renderOrder(req.pieces)
    const view = req.mode === 'tryon' && !req.personPhotoUrl ? 'flatlay' : req.mode
    const first = await check((await drawOnce(req)).url, pieces, view)
    if (!first.redraw.length || Date.now() - started > REDRAW_IF_UNDER_MS) return logged(first, [first])
    const second = await drawOnce(req).then((d) => check(d.url, pieces, view)).catch(() => null)
    return logged(second ? better([first, second]) : first, second ? [first, second] : [first])
  },
}
