import sharp from 'sharp'
import { expect, test } from 'vitest'
import { iou, isWholeGarment, linkTracks, maskPng, meanColor, sampleIndices, type Sighting } from '@/lib/models/real/segmenter'

test('sampleIndices spreads at most n frames across the scan, first and last included', () => {
  expect(sampleIndices(44)).toHaveLength(44)      // a 40 s video's frames all go to SAM
  expect(sampleIndices(1, 8)).toEqual([0])
  expect(sampleIndices(5, 8)).toEqual([0, 1, 2, 3, 4])
  const s = sampleIndices(120, 8)
  expect(s).toHaveLength(8)
  expect(s[0]).toBe(0)
  expect(s.at(-1)).toBe(119)
  expect(new Set(s).size).toBe(8)
})

test('iou of normalized boxes', () => {
  expect(iou([0, 0, 0.5, 0.5], [0, 0, 0.5, 0.5])).toBe(1)
  expect(iou([0, 0, 0.5, 0.5], [0.5, 0.5, 1, 1])).toBe(0)
  expect(iou([0, 0, 0.5, 0.5], [0.25, 0, 0.75, 0.5])).toBeCloseTo(1 / 3)
})

const GREY: [number, number, number] = [128, 128, 128]
const s = (frameIndex: number, box: Sighting['box'], share = 0.3, color = GREY): Sighting => ({ frameIndex, box, share, color, mask: { frameIndex, maskPng: Buffer.alloc(0), area: 1, bbox: [0, 0, 1, 1] } })

test('linkTracks joins overlapping sightings in neighbouring sampled frames, and nothing else', () => {
  const tracks = linkTracks([
    [s(0, [0, 0, 0.4, 0.4]), s(0, [0.6, 0.6, 1, 1])],
    [s(10, [0.05, 0, 0.45, 0.4])],                 // the first piece, drifted a little
    [s(20, [0.6, 0.6, 1, 1])],                     // same place as piece 2, but frame 10 broke the chain
  ])
  expect(tracks.map((t) => t.masks.map((m) => m.frameIndex))).toEqual([[0, 10], [0], [20]])
  expect(new Set(tracks.map((t) => t.trackId)).size).toBe(3)
})

test('linkTracks gives each sighting to at most one track', () => {
  const tracks = linkTracks([[s(0, [0, 0, 0.5, 0.5])], [s(1, [0, 0, 0.5, 0.5]), s(1, [0.02, 0, 0.5, 0.5])]])
  expect(tracks.map((t) => t.masks.length).sort()).toEqual([1, 2])
})

test('maskPng places the box-sized raster into a full-frame alpha mask', async () => {
  const raster = new Uint8Array([1, 1, 0, 1]) // 2×2
  const png = await maskPng(raster, { width: 2, height: 2 }, { left: 3, top: 1 }, 6, 4)
  const { data, info } = await sharp(png).extractChannel(0).raw().toBuffer({ resolveWithObject: true })
  expect((await sharp(png).metadata()).channels).toBe(1)
  expect([info.width, info.height]).toEqual([6, 4])
  const on = [...data].flatMap((v, i) => (v ? [[i % 6, Math.floor(i / 6)]] : []))
  expect(on).toEqual([[3, 1], [4, 1], [4, 2]])
})

test('maskPng clips a raster that runs past the frame edge', async () => {
  const png = await maskPng(new Uint8Array(9).fill(1), { width: 3, height: 3 }, { left: 4, top: 2 }, 5, 4)
  const { data } = await sharp(png).extractChannel(0).raw().toBuffer({ resolveWithObject: true })
  expect([...data].filter(Boolean)).toHaveLength(2)
})

test('linkTracks follows a pan: every piece shifts by the same offset between sampled frames', () => {
  // two pieces 0.3 wide; the camera pans so everything moves 0.2 left per sampled frame (IoU alone would be 0.2)
  const tracks = linkTracks([
    [s(0, [0.3, 0.1, 0.6, 0.9]), s(0, [0.65, 0.1, 0.95, 0.5])],
    [s(5, [0.1, 0.1, 0.4, 0.9]), s(5, [0.45, 0.1, 0.75, 0.5]), s(5, [0.8, 0.5, 0.99, 0.9])],
  ])
  expect(tracks.map((t) => t.masks.map((m) => m.frameIndex))).toEqual([[0, 5], [0, 5], [5]])
})

test('linkTracks does not invent a pan from a single unrelated pair', () => {
  const tracks = linkTracks([[s(0, [0, 0, 0.2, 0.2])], [s(1, [0.7, 0.7, 0.9, 0.9])]])
  expect(tracks).toHaveLength(2)
})

test('isWholeGarment: in a video, only a piece pulled forward (big and wide) counts; a photo keeps everything', () => {
  // measured on a real packed rail: front-on shirts cover 25–55% of the frame and over half its width
  const pulled = s(0, [0.1, 0.05, 0.85, 0.95], 0.42)
  const sleeve = s(0, [0.5, 0.1, 0.9, 0.8], 0.2)                // a sleeve or a half-hidden shirt
  const sliver = s(0, [0.3, 0, 0.62, 1], 0.27)                  // tall edge of a hanging shirt: narrow
  expect([pulled, sleeve, sliver].map((x) => isWholeGarment(x, 'video'))).toEqual([true, false, false])
  // one wide photo of a closet: each piece is small, and that's fine
  expect(isWholeGarment(s(0, [0.05, 0.05, 0.27, 0.43], 0.05), 'photo')).toBe(true)
})

test('isWholeGarment: a close-up that fills the frame edge to edge is not a whole garment', () => {
  // measured on a hold-up clip: close-ups covered ≥ 60% of the frame and touched all four edges; whole pieces held up stayed under
  expect(isWholeGarment(s(0, [0, 0, 1, 1], 0.62), 'video')).toBe(false)
  expect(isWholeGarment(s(0, [0, 0, 1, 1], 0.55), 'video')).toBe(true)      // held up close, sleeves past the edges
  expect(isWholeGarment(s(0, [0, 0.07, 1, 0.98], 0.61), 'video')).toBe(true) // big, but its hem and collar are in frame
})

test('linkTracks: flipping through, the next piece lands in the same spot, so color decides', () => {
  const front: Sighting['box'] = [0.1, 0.05, 0.85, 0.95]
  const tracks = linkTracks([
    [s(0, front, 0.4, [40, 60, 150])],      // blue tee
    [s(1, front, 0.4, [45, 62, 140])],      // the same tee, light shifted a little
    [s(2, front, 0.4, [30, 32, 40])],       // the navy one pulled forward next
  ])
  expect(tracks.map((t) => t.masks.map((m) => m.frameIndex))).toEqual([[0, 1], [2]])
})

test('meanColor averages the frame only under the mask', () => {
  // 3×1 frame: red, green, blue; a 2×1 mask at x=1 covering just the blue pixel
  const rgb = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255])
  expect(meanColor(rgb, 3, new Uint8Array([0, 1]), 2, { left: 1, top: 0 })).toEqual([0, 0, 255])
})
