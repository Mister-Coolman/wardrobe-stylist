import sharp from 'sharp'
import { describe, expect, test } from 'vitest'
import { better, framingProblem, LETTERING, split } from '@/lib/models/real/renderCheck'

const PAPER = { r: 233, g: 229, b: 220 }
/** A 4:5 picture on paper with a navy block from y0 to y1 (shares of the height), x from 30% to 70% */
const picture = async (y0: number, y1: number, x0 = 0.3, x1 = 0.7) => {
  const W = 400, H = 500
  const block = await sharp({ create: { width: Math.round((x1 - x0) * W), height: Math.round((y1 - y0) * H), channels: 3, background: { r: 20, g: 30, b: 70 } } }).png().toBuffer()
  return sharp({ create: { width: W, height: H, channels: 3, background: PAPER } }).composite([{ input: block, left: Math.round(x0 * W), top: Math.round(y0 * H) }]).jpeg().toBuffer()
}

describe('framingProblem', () => {
  test('an outfit with paper all round passes', async () => {
    expect(await framingProblem(await picture(0.04, 0.96))).toBeNull()
  })
  test('on a mannequin, a studio wall shading down a side edge is not mistaken for a garment', async () => {
    const W = 400, H = 500, px = Buffer.alloc(W * H * 3)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      // as measured on a mannequin picture's right edge: 206 at the top, 182 in the middle, 224 at the bottom
      const edge = y < H / 2 ? 206 - (24 * y) / (H / 2) : 182 + (42 * (y - H / 2)) / (H / 2)
      const v = Math.round(edge + (232 - edge) * (1 - x / W) ** 3)
      px.fill(v, (y * W + x) * 3, (y * W + x) * 3 + 3)
    }
    const vignette = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).jpeg().toBuffer()
    // a mannequin's sides aren't checked; its top and bottom still are
    expect(await framingProblem(vignette, false)).toBeNull()
    expect(await framingProblem(await picture(0.04, 1), false)).toBe('cut off at the bottom')
  })

  test('trousers running off the bottom, or a top off the top, fail and say where', async () => {
    expect(await framingProblem(await picture(0.04, 1))).toBe('cut off at the bottom')
    expect(await framingProblem(await picture(0, 0.9))).toBe('cut off at the top')
    expect(await framingProblem(await picture(0.1, 0.9, 0, 0.5))).toBe('cut off at the left')
  })
})

describe('which drawing to keep', () => {
  test('lettering on a label is minor: it comes back on a redraw, so it never asks for one', () => {
    expect(split(['cut off at the bottom', LETTERING])).toEqual({ redraw: ['cut off at the bottom'], minor: [LETTERING] })
  })
  test('the drawing with fewer problems worth a redraw wins, then fewer minor ones; the first on a tie', () => {
    const a = { url: 'a', redraw: ['cut off at the bottom'], minor: [] }
    const b = { url: 'b', redraw: [], minor: [LETTERING] }
    const c = { url: 'c', redraw: [], minor: [] }
    expect(better([a, b]).url).toBe('b')
    expect(better([b, c]).url).toBe('c')
    expect(better([c, { ...c, url: 'd' }]).url).toBe('c')
  })
})
