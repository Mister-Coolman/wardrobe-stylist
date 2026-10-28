import sharp from 'sharp'
import { expect, test } from 'vitest'
import { dropEdgeFragments, iou, linkTracks, maskPng, sampleIndices, type Sighting } from '@/lib/models/real/segmenter'

test('sampleIndices spreads at most n frames across the scan, first and last included', () => {
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

const s = (frameIndex: number, box: Sighting['box']): Sighting => ({ frameIndex, box, mask: { frameIndex, maskPng: Buffer.alloc(0), area: 1, bbox: [0, 0, 1, 1] } })

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

test('dropEdgeFragments: in a multi-frame scan, a small piece only ever seen cut off at the edge is dropped', () => {
  const edge = s(0, [0, 0.4, 0.1, 0.6]), whole = s(1, [0.3, 0.3, 0.5, 0.6]), big = s(0, [0, 0, 0.8, 1])
  const t = (id: string, ...xs: Sighting[]) => ({ trackId: id, sightings: xs })
  expect(dropEdgeFragments([t('a', edge), t('b', edge, whole), t('c', big)], 2).map((x) => x.trackId)).toEqual(['b', 'c'])
  expect(dropEdgeFragments([t('a', edge)], 1).map((x) => x.trackId)).toEqual(['a'])
})
