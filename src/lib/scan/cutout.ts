import sharp from 'sharp'
import type { FrameMask, SegmentTrack } from '@/lib/models/types'

/** The sighting with the largest area × sharpness. */
export function bestFrame(track: SegmentTrack, sharpness: (frameIndex: number) => number): FrameMask {
  return track.masks.reduce((best, m) => (m.area * sharpness(m.frameIndex) > best.area * sharpness(best.frameIndex) ? m : best))
}

/** Laplacian standard deviation — higher is sharper. */
export async function sharpnessOf(frame: Buffer): Promise<number> {
  const { channels } = await sharp(frame).greyscale().convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] }).stats()
  return channels[0].stdev || 1e-6
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
