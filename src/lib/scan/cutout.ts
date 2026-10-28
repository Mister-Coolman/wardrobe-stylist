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

/** Apply the mask as alpha, trim to its bounding box plus 4% padding, PNG. */
export async function cutout(frame: Buffer, mask: Buffer): Promise<Buffer> {
  const { width: W = 0, height: H = 0 } = await sharp(frame).metadata()
  const alpha = await sharp(mask).resize(W, H, { fit: 'fill' }).greyscale().extractChannel(0).raw().toBuffer()
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (alpha[y * W + x] > 127) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  }
  if (x1 < 0) throw new Error('empty mask')
  const pad = Math.round(Math.max(W, H) * 0.04)
  const left = Math.max(0, x0 - pad), top = Math.max(0, y0 - pad)
  const width = Math.min(W, x1 + pad + 1) - left, height = Math.min(H, y1 + pad + 1) - top
  const rgb = await sharp(frame).removeAlpha().toColourspace('srgb').raw().toBuffer()
  const rgba = Buffer.alloc(W * H * 4)
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2]; rgba[i * 4 + 3] = alpha[i]
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
