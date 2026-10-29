import sharp from 'sharp'
import type { FrameMask, SegmentTrack } from '@/lib/models/types'

/** The sighting with the largest area × sharpness. */
export function bestFrame(track: SegmentTrack, sharpness: (m: FrameMask) => number): FrameMask {
  return track.masks.reduce((best, m) => (m.area * sharpness(m) > best.area * sharpness(best) ? m : best))
}

const LAPLACIAN = { width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 }

/** Laplacian standard deviation over the garment's pixels only — higher is sharper. A piece moving past a sharp
 *  background (a wood door, a wall) would otherwise score as in focus. */
export async function sharpnessUnder(frame: Buffer, mask: Buffer): Promise<number> {
  const { data: lap, info } = await sharp(frame).greyscale().convolve(LAPLACIAN).raw().toBuffer({ resolveWithObject: true })
  const alpha = await sharp(mask).resize(info.width, info.height, { fit: 'fill' }).greyscale().extractChannel(0).raw().toBuffer()
  let n = 0, sum = 0, sq = 0
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] <= 127) continue
    const v = lap[i * info.channels]
    n++; sum += v; sq += v * v
  }
  if (!n) return 1e-6
  const mean = sum / n
  return Math.sqrt(Math.max(0, sq / n - mean * mean)) || 1e-6
}

/** 4-connected regions of pixels where m[i] === value: a label per pixel (0 = other value) and each region's size. */
function regions(m: Uint8Array, W: number, H: number, value: number): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(m.length), sizes = [0], stack: number[] = []
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== value || label[i]) continue
    const id = sizes.length
    let n = 0
    label[i] = id; stack.push(i)
    while (stack.length) {
      const p = stack.pop()!, x = p % W
      n++
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p >= W ? p - W : -1, p + W < W * H ? p + W : -1]) {
        if (q >= 0 && m[q] === value && !label[q]) { label[q] = id; stack.push(q) }
      }
    }
    sizes.push(n)
  }
  return { label, sizes }
}

/** Holes up to this share of the piece are a logo or a highlight SAM left out; bigger ones are real openings (a bag handle). */
const MAX_HOLE = 0.02
/** Parts smaller than this share of the largest are specks: a hanger tip, a patch of the shirt behind. */
const MIN_PART = 0.01

/** Fill small holes and drop specks in a 0/1 mask. Measured on flip-through cutouts: a black tee came back with
 *  1.8% of its area as pinholes, and a polo with stray fragments around it (docs/notes/sam-check.md). */
export function cleanMask(on: Uint8Array, W: number, H: number): Uint8Array {
  const out = Uint8Array.from(on)
  const parts = regions(on, W, H, 1)
  const largest = Math.max(0, ...parts.sizes)
  for (let i = 0; i < out.length; i++) if (out[i] && parts.sizes[parts.label[i]] < MIN_PART * largest) out[i] = 0
  const area = out.reduce((s, v) => s + v, 0)
  const gaps = regions(out, W, H, 0)
  const touchesEdge = new Set<number>()
  for (let x = 0; x < W; x++) touchesEdge.add(gaps.label[x]).add(gaps.label[(H - 1) * W + x])
  for (let y = 0; y < H; y++) touchesEdge.add(gaps.label[y * W]).add(gaps.label[y * W + W - 1])
  for (let i = 0; i < out.length; i++) {
    const g = gaps.label[i]
    if (g && !touchesEdge.has(g) && gaps.sizes[g] <= MAX_HOLE * area) out[i] = 1
  }
  return out
}

/** Pixels within r of the mask (square neighbourhood): a separable box dilation via running counts. */
function dilate(on: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const rows = new Uint8Array(on.length), out = new Uint8Array(on.length)
  for (let y = 0; y < H; y++) {
    let n = 0
    for (let x = 0; x < Math.min(r, W); x++) n += on[y * W + x]
    for (let x = 0; x < W; x++) {
      if (x + r < W) n += on[y * W + x + r]
      if (x - r - 1 >= 0) n -= on[y * W + x - r - 1]
      rows[y * W + x] = n > 0 ? 1 : 0
    }
  }
  for (let x = 0; x < W; x++) {
    let n = 0
    for (let y = 0; y < Math.min(r, H); y++) n += rows[y * W + x]
    for (let y = 0; y < H; y++) {
      if (y + r < H) n += rows[(y + r) * W + x]
      if (y - r - 1 >= 0) n -= rows[(y - r - 1) * W + x]
      out[y * W + x] = n > 0 ? 1 : 0
    }
  }
  return out
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** The wall around a piece: a band 1–4% of the frame outside the mask. Only a plain, light, near-neutral band counts
 *  (a painted wall under a lamp); a wood door or the next shirt is no reference, and then nothing is corrected. */
const BAND_IN = 0.01, BAND_OUT = 0.04
const WALL_MIN_LUMA = 60, WALL_MAX_SPREAD = 0.15, WALL_MAX_SATURATION = 0.4
/** A wall darker than this is a dim room: lift the piece by up to MAX_LIFT, rolling highlights off above SHOULDER. */
const WALL_TARGET = 200, MAX_LIFT = 1.8, SHOULDER = 200
const GAIN_RANGE: [number, number] = [0.7, 1.4]

/** Per-channel gains that make the wall neutral grey at its own brightness, times the lift for a dim room; null without a usable wall. */
export function wallCorrection(rgb: Buffer, on: Uint8Array, W: number, H: number): RGB | null {
  const edge = Math.max(W, H)
  const near = dilate(on, W, H, Math.max(2, Math.round(BAND_IN * edge))), far = dilate(on, W, H, Math.max(4, Math.round(BAND_OUT * edge)))
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  let n = 0, sum = 0, sq = 0
  for (let i = 0; i < on.length; i++) {
    if (!far[i] || near[i]) continue
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2], y = luma(r, g, b)
    hist[0][r]++; hist[1][g]++; hist[2][b]++
    n++; sum += y; sq += y * y
  }
  if (n < 50) return null
  const median = (h: Uint32Array) => { let c = 0; for (let v = 0; v < 256; v++) if ((c += h[v]) >= n / 2) return Math.max(1, v); return 255 }
  const wall = hist.map(median) as RGB
  const mean = sum / n, spread = Math.sqrt(Math.max(0, sq / n - mean * mean)) / mean
  const y = luma(...wall), saturation = (Math.max(...wall) - Math.min(...wall)) / Math.max(...wall)
  if (y < WALL_MIN_LUMA || spread > WALL_MAX_SPREAD || saturation > WALL_MAX_SATURATION) return null
  const lift = Math.min(MAX_LIFT, Math.max(1, WALL_TARGET / y))
  return wall.map((c) => Math.min(GAIN_RANGE[1], Math.max(GAIN_RANGE[0], y / c)) * lift) as RGB
}

const shoulder = (v: number) => (v <= SHOULDER ? v : SHOULDER + (255 - SHOULDER) * (1 - Math.exp(-(v - SHOULDER) / (255 - SHOULDER))))

/** Apply the cleaned mask (minus any hangers) as alpha with a softened edge, correct the light against the wall
 *  around the piece, then trim to the bounding box plus 4% padding. PNG. */
export async function cutout(frame: Buffer, mask: Buffer, opts: { minus?: Buffer[] } = {}): Promise<Buffer> {
  const { width: W = 0, height: H = 0 } = await sharp(frame).metadata()
  const binary = async (m: Buffer) => Uint8Array.from(await sharp(m).resize(W, H, { fit: 'fill' }).greyscale().extractChannel(0).raw().toBuffer(), (v) => (v > 127 ? 1 : 0))
  const on = await binary(mask)
  for (const m of opts.minus ?? []) { const h = await binary(m); for (let i = 0; i < on.length; i++) if (h[i]) on[i] = 0 }
  const clean = cleanMask(on, W, H)
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (clean[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) throw new Error('empty mask')
  const pad = Math.round(Math.max(W, H) * 0.04)
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad)
  const width = Math.min(W, x1 + pad + 1) - left, height = Math.min(H, y1 + pad + 1) - top
  const rgb = await sharp(frame).removeAlpha().toColourspace('srgb').raw().toBuffer()
  const gain = wallCorrection(rgb, clean, W, H)
  // a pixel in from the outline, then a soft edge: no rim of wall colour around the piece
  const inner = Uint8Array.from(clean, (v, i) => (v && (i % W === 0 || clean[i - 1]) && (i % W === W - 1 || clean[i + 1]) && (i < W || clean[i - W]) && (i + W >= clean.length || clean[i + W]) ? 255 : 0))
  const alpha = await sharp(Buffer.from(inner), { raw: { width: W, height: H, channels: 1 } }).blur(0.8).extractChannel(0).raw().toBuffer()
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = gain ? Math.round(shoulder(rgb[i * 3 + c] * gain[c])) : rgb[i * 3 + c]
    rgba[i * 4 + 3] = alpha[i]
  }
  return sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).extract({ left, top, width, height }).png().toBuffer()
}

export type RGB = [number, number, number]
export const colorDistance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Mean color of a cutout's opaque pixels. */
export async function cutoutColor(png: Buffer): Promise<RGB> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const sum: RGB = [0, 0, 0]
  let n = 0
  for (let i = 0; i < info.width * info.height; i++) {
    if (data[i * 4 + 3] < 128) continue
    sum[0] += data[i * 4]; sum[1] += data[i * 4 + 1]; sum[2] += data[i * 4 + 2]; n++
  }
  return n ? [sum[0] / n, sum[1] / n, sum[2] / n] : sum
}
