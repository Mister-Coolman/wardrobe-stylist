// Checks on a drawn look, so a bad picture is drawn again before anyone sees it. Measured on 30-odd flat lays: trouser
// hems ran off the frame in up to half of them, a fleece was drawn twice, and made-up lettering appeared on neck labels.
import sharp from 'sharp'
import { z } from 'zod'
import type { RenderPiece } from '../types'
import { structured } from './client'

/** A row or column "has garment" when this share of its pixels differs clearly from the background */
const FILLED = 0.03
/** How close to an edge (share of the side) the garment may come */
const EDGE = 0.01

/** The picture's edges are bare background: nothing cut off. The background is sampled from the corners. On a mannequin
 *  or a person only the top and bottom are checked (a head or feet cut off): their studio wall shades from 224 to 182
 *  down a side edge, which a single background colour took for a garment. */
export async function framingProblem(image: Buffer, sides = true): Promise<string | null> {
  const { data, info } = await sharp(image).resize(200, 250, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height
  const px = (x: number, y: number) => [data[(y * W + x) * 3], data[(y * W + x) * 3 + 1], data[(y * W + x) * 3 + 2]]
  const corners = [px(2, 2), px(W - 3, 2), px(2, H - 3), px(W - 3, H - 3)]
  const bg = [0, 1, 2].map((c) => corners.map((p) => p[c]).sort((a, b) => a - b)[2])
  const far = (p: number[]) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]) > 45
  const share = (n: number, f: (i: number) => number[]) => Array.from({ length: n }, (_, i) => f(i)).filter(far).length / n
  const rows = Math.max(1, Math.round(H * EDGE)), cols = Math.max(1, Math.round(W * EDGE))
  for (let i = 0; i < rows; i++) {
    if (share(W, (x) => px(x, i)) > FILLED) return 'cut off at the top'
    if (share(W, (x) => px(x, H - 1 - i)) > FILLED) return 'cut off at the bottom'
  }
  for (let i = 0; i < (sides ? cols : 0); i++) {
    if (share(H, (y) => px(i, y)) > FILLED) return 'cut off at the left'
    if (share(H, (y) => px(W - 1 - i, y)) > FILLED) return 'cut off at the right'
  }
  return null
}

const Report = z.object({
  pieces: z.array(z.object({ number: z.number().int(), shown: z.enum(['once', 'more than once', 'missing']), colourRight: z.boolean() })),
  extraGarment: z.boolean(),
  labelLettering: z.boolean(),
})

/** What a vision model sees wrong in the picture against the pieces it should show; [] when it looks right */
export async function contentProblems(imageDataUrl: string, pieces: RenderPiece[], colourOf: (p: RenderPiece) => string | null): Promise<string[]> {
  const list = pieces.map((p, i) => `${i + 1}. ${p.name}${colourOf(p) ? ` (colour: ${colourOf(p)})` : ''}`).join('\n')
  const r = await structured('renderer', Report, 'render_check', [
    { role: 'system', content: 'You check a generated outfit picture against the list of garments it should show. For each numbered garment: shown is "once" when it appears exactly once (a layer worn under another counts as shown if only its collar or hem is visible), "more than once" when two copies of it appear, "missing" when it is not there; colourRight is false only when its colour is clearly different from the listed colour. extraGarment: true when any garment appears that is not on the list. labelLettering: true when there are readable letters or words on a neck label, a waistband patch or a tag (logos printed or embroidered on the outside of a garment do not count).' },
    { role: 'user', content: [{ type: 'text', text: `The garments:\n${list}` }, { type: 'image_url', image_url: { url: imageDataUrl } }] },
  ], { effort: 'low', ms: 30_000 })
  const name = (n: number) => pieces[n - 1]?.name ?? `piece ${n}`
  return [
    ...r.pieces.filter((p) => p.shown !== 'once').map((p) => `${name(p.number)} ${p.shown === 'missing' ? 'is missing' : 'is drawn twice'}`),
    ...r.pieces.filter((p) => !p.colourRight).map((p) => `${name(p.number)} is the wrong colour`),
    ...(r.extraGarment ? ['an extra garment is drawn'] : []),
    ...(r.labelLettering ? [LETTERING] : []),
  ]
}

export interface Checked { url: string; redraw: string[]; minor: string[] }
/** Problems a second drawing usually fixes; lettering on a label is copied from the real label in the photo and comes back
 *  every time (8 of 15 pictures in a check), so it only decides between two drawings. */
export const split = (problems: string[]) => ({
  redraw: problems.filter((p) => p !== LETTERING), minor: problems.filter((p) => p === LETTERING),
})
export const LETTERING = 'lettering on a label'
/** The better of the drawings: fewest problems worth a redraw, then fewest minor ones; the earlier one on a tie */
export const better = (drawings: Checked[]) => drawings.reduce((a, b) => (b.redraw.length * 10 + b.minor.length < a.redraw.length * 10 + a.minor.length ? b : a))
