// SAM 3.1 via /v1/responses: one image call per sampled frame with a noun-phrase prompt,
// output parsed with @meta-sam/parser. Sightings are linked across neighbouring sampled frames by
// box overlap; the scan pipeline's tag-based dedupe merges whatever linking misses.
import { decodeMaskToRaster, parseImageStream, recordsOfKind } from '@meta-sam/parser'
import sharp from 'sharp'
import { getStorage } from '@/lib/storage'
import type { FrameMask, Segmenter, SegmentTrack } from '../types'
import { ModelError, withTimeout } from '../types'
import { meta } from './client'

const SAM = 'sam-3.1'
const PROMPT = 'clothing'
const MAX_SAMPLED = 8
const CONCURRENCY = 4
const MAX_EDGE = 1280
const MIN_CONFIDENCE = 0.4
/** masks smaller than this share of the frame are buttons, tags and hangers */
const MIN_AREA = 0.01
const LINK_IOU = 0.5
const FRAME_MS = 60_000

/** box as [left, top, right, bottom], each 0–1 of the frame */
type Box = [number, number, number, number]
export interface Sighting { frameIndex: number; box: Box; mask: FrameMask }

/** At most n indices spread evenly over count frames, first and last included. */
export function sampleIndices(count: number, n = MAX_SAMPLED): number[] {
  if (count <= n) return Array.from({ length: count }, (_, i) => i)
  return Array.from({ length: n }, (_, i) => Math.round((i * (count - 1)) / (n - 1)))
}

export function iou(a: Box, b: Box): number {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  if (w <= 0 || h <= 0) return 0
  const inter = w * h
  const area = (x: Box) => (x[2] - x[0]) * (x[3] - x[1])
  return inter / (area(a) + area(b) - inter)
}

const shift = (b: Box, [dx, dy]: [number, number]): Box => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy]
const center = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
const sameSize = (a: Box, b: Box) => [[a[2] - a[0], b[2] - b[0]], [a[3] - a[1], b[3] - b[1]]].every(([x, y]) => x / y > 0.75 && x / y < 1.33)

/** Greedy one-to-one pairs of prev → cur whose boxes overlap once prev is shifted by the offset. */
function matchesAt(prev: Box[], cur: Box[], offset: [number, number]): [number, number][] {
  const pairs: [number, number, number][] = []
  prev.forEach((p, i) => cur.forEach((c, j) => { const v = iou(shift(p, offset), c); if (v >= LINK_IOU) pairs.push([i, j, v]) }))
  const usedP = new Set<number>(), usedC = new Set<number>(), out: [number, number][] = []
  for (const [i, j] of pairs.sort((a, b) => b[2] - a[2])) {
    if (usedP.has(i) || usedC.has(j)) continue
    usedP.add(i); usedC.add(j); out.push([i, j])
  }
  return out
}

/** The camera's shift between two sampled frames: the offset most pieces agree on. A pan needs two pieces to vouch for it. */
function bestMatches(prev: Box[], cur: Box[]): [number, number][] {
  let best = matchesAt(prev, cur, [0, 0])
  for (const p of prev) for (const c of cur) {
    if (!sameSize(p, c)) continue
    const [px, py] = center(p), [cx, cy] = center(c)
    const m = matchesAt(prev, cur, [cx - px, cy - py])
    if (m.length >= 2 && m.length > best.length) best = m
  }
  return best
}

interface SightingTrack { trackId: string; sightings: Sighting[] }

/** frames: sightings per sampled frame, in scan order. Each sighting joins the track it continues from the previous sampled frame. */
export function linkSightings(frames: Sighting[][]): SightingTrack[] {
  const tracks: SightingTrack[] = []
  let prev: { track: SightingTrack; s: Sighting }[] = []
  for (const sightings of frames) {
    const pairs = new Map(bestMatches(prev.map((p) => p.s.box), sightings.map((x) => x.box)).map(([i, j]) => [j, i]))
    prev = sightings.map((s, j) => {
      const from = pairs.get(j)
      const track = from === undefined ? (tracks.push({ trackId: `sam-${tracks.length}`, sightings: [] }), tracks.at(-1)!) : prev[from].track
      track.sightings.push(s)
      return { track, s }
    })
  }
  return tracks
}

export function linkTracks(frames: Sighting[][]): SegmentTrack[] {
  return linkSightings(frames).map((t) => ({ trackId: t.trackId, masks: t.sightings.map((s) => s.mask) }))
}

const EDGE = 0.01
const touchesEdge = (b: Box) => b[0] <= EDGE || b[1] <= EDGE || b[2] >= 1 - EDGE || b[3] >= 1 - EDGE

/** In a pan, pieces slide out of frame: a small track only ever seen cut off is a fragment of something seen whole elsewhere. */
export function dropEdgeFragments<T extends SightingTrack>(tracks: T[], sampledFrames: number): T[] {
  if (sampledFrames < 2) return tracks
  return tracks.filter((t) => t.sightings.some((s) => !touchesEdge(s.box) || (s.box[2] - s.box[0]) * (s.box[3] - s.box[1]) >= 0.5))
}

/** SAM returns a box-sized raster; cutout() wants a full-frame greyscale mask. */
export async function maskPng(raster: Uint8Array, size: { width: number; height: number }, at: { left: number; top: number }, W: number, H: number): Promise<Buffer> {
  const out = Buffer.alloc(W * H)
  for (let y = 0; y < size.height; y++) {
    const fy = at.top + y
    if (fy < 0 || fy >= H) continue
    for (let x = 0; x < size.width; x++) {
      const fx = at.left + x
      if (fx >= 0 && fx < W && raster[y * size.width + x]) out[fy * W + fx] = 255
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 1 } }).toColourspace('b-w').png().toBuffer()
}

async function segmentFrame(url: string, frameIndex: number): Promise<Sighting[]> {
  const img = await sharp(await getStorage().read(url)).rotate().resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = img.info
  const run = async () => {
    const stream = await meta().responses.create({
      model: SAM, stream: true, metadata: { include_confidence: 'true' },
      input: [{ role: 'user', content: [
        { type: 'input_text', text: PROMPT },
        { type: 'input_image', image_url: `data:image/jpeg;base64,${img.data.toString('base64')}`, detail: 'auto' },
      ] }],
    })
    return parseImageStream(stream).finalResult
  }
  const result = await withTimeout(run(), FRAME_MS, 'segmenter')
  if (result.outcome.status !== 'completed') throw new ModelError('segmenter', 'bad_output', `frame ${frameIndex}: ${JSON.stringify(result.outcome)}`)
  const out: Sighting[] = []
  for (const m of recordsOfKind(result.records, 'mask')) {
    if (m.confidence !== undefined && m.confidence < MIN_CONFIDENCE) continue
    const raster = decodeMaskToRaster(m.mask)
    const area = raster.reduce((s, v) => s + v, 0)
    if (area < MIN_AREA * W * H) continue
    const b = m.bounds
    out.push({
      frameIndex, box: [b.left / W, b.top / H, b.right / W, b.bottom / H],
      mask: { frameIndex, area, bbox: [b.left, b.top, b.right - b.left, b.bottom - b.top], maskPng: await maskPng(raster, m.mask, b, W, H) },
    })
  }
  return out
}

export const realSegmenter: Segmenter = {
  async segment(frameUrls) {
    const picks = sampleIndices(frameUrls.length)
    const results: (Sighting[] | null)[] = new Array(picks.length).fill(null)
    let next = 0, failures = 0, lastError: unknown
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, picks.length) }, async () => {
      while (next < picks.length) {
        const k = next++
        try { results[k] = await segmentFrame(frameUrls[picks[k]], picks[k]) }
        catch (e) { failures++; lastError = e; console.warn('segmenter frame failed', picks[k], e) }
      }
    }))
    if (picks.length && failures === picks.length) {
      throw lastError instanceof ModelError ? lastError : new ModelError('segmenter', 'http', lastError instanceof Error ? lastError.message : 'every frame failed')
    }
    // a failed frame breaks the chain rather than shifting neighbours together
    return dropEdgeFragments(linkSightings(results.map((r) => r ?? [])), picks.length)
      .map((t) => ({ trackId: t.trackId, masks: t.sightings.map((s) => s.mask) }))
  },
}
