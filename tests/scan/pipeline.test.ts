import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, test } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import { getModels } from '@/lib/models'
import type { FrameMask, SegmentTrack, Segmenter, Tagger } from '@/lib/models'
import { FIXTURE_TAGS } from '@/lib/models/fixtures/garments'
import { bestFrame, cleanMask, cutout, sharpnessUnder } from '@/lib/scan/cutout'
import { NO_CLOTHES, piecesFromScan, runScan } from '@/lib/scan/pipeline'
import { createMemoryStorage } from '@/lib/storage'

const mask = async (x: number, y: number, w: number, h: number, W = 100, H = 100) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/></svg>`)).greyscale().png().toBuffer()
const frame = () => sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 120, g: 90, b: 60 } } }).jpeg().toBuffer()

/** left half red, right half blue */
const twoColorFrame = () => sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="100" fill="#c02020"/><rect x="50" width="50" height="100" fill="#2030c0"/></svg>')).jpeg().toBuffer()

async function setup(tracks: SegmentTrack[], tags = FIXTURE_TAGS, opts: { frame?: Buffer; sameItem?: Tagger['sameItem'] } = {}) {
  const repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'scan-')), 'db.json'))
  const storage = createMemoryStorage()
  const frameUrl = await storage.put('u/frames/0.jpg', opts.frame ?? await frame(), 'image/jpeg')
  const job = await repo.createScanJob('u1', frameUrl, [frameUrl])
  const segmenter: Segmenter = { segment: async () => tracks }
  const byUrl = new Map<string, number>()
  const tagger: Tagger = {
    tag: async (u) => { if (!byUrl.has(u)) byUrl.set(u, byUrl.size); return tags[byUrl.get(u)!] },
    sameItem: opts.sameItem ?? (async (a, b) => a === b),
  }
  const models = { ...getModels(), segmenter, tagger }
  return { repo, storage, job, models }
}
const track = async (id: string, r: [number, number, number, number]): Promise<SegmentTrack> =>
  ({ trackId: id, masks: [{ frameIndex: 0, maskPng: await mask(...r), area: r[2] * r[3], bbox: r }] })

describe('runScan', () => {
  test('3 garments with one filmed twice → 3 unconfirmed garments, job in review', async () => {
    const tracks = [await track('a', [0, 0, 40, 40]), await track('b', [50, 0, 40, 40]), await track('c', [0, 50, 40, 40]), await track('a2', [0, 0, 40, 40])]
    const { repo, storage, job, models } = await setup(tracks)
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    const gs = await repo.listGarments('u1')
    expect(gs).toHaveLength(3)
    expect(gs.every((g) => !g.confirmed && g.cutoutUrl)).toBe(true)
    const j = await repo.getScanJob('u1', job.id)
    expect(j).toMatchObject({ status: 'review', foundCount: 3, progress: 1 })
  })

  test('different items that only look alike are kept', async () => {
    const twinTees = [FIXTURE_TAGS[7], FIXTURE_TAGS[7]]
    const { repo, storage, job, models } = await setup([await track('a', [0, 0, 40, 40]), await track('b', [50, 50, 40, 40])], twinTees)
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    expect(await repo.listGarments('u1')).toHaveLength(2)
  })

  test('the same piece tagged in different words in two frames is still compared, and merged', async () => {
    const top = FIXTURE_TAGS.find((t) => t.category === 'top')!
    const asked: string[][] = []
    const { repo, storage, job, models } = await setup([await track('a', [0, 0, 40, 40]), await track('b', [50, 50, 40, 40])],
      [{ ...top, subcategory: 'tshirt', colors: ['white'] }, { ...top, subcategory: 'other', colors: ['cream'] }],
      { sameItem: async (a, b) => { asked.push([a, b]); return true } })
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    expect(asked).toHaveLength(1)
    expect(await repo.listGarments('u1')).toHaveLength(1)
  })

  test('pieces of clearly different colors are never compared', async () => {
    const top = FIXTURE_TAGS.find((t) => t.category === 'top')!
    let asked = 0
    const { repo, storage, job, models } = await setup([await track('red', [5, 10, 40, 80]), await track('blue', [55, 10, 40, 80])],
      [top, top], { frame: await twoColorFrame(), sameItem: async () => { asked++; return true } })
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    expect(asked).toBe(0)
    expect(await repo.listGarments('u1')).toHaveLength(2)
  })

  test('review shows only the pieces from this scan, not unconfirmed ones left by an earlier scan', async () => {
    const { repo, storage, job, models } = await setup([await track('a', [0, 0, 40, 40])])
    const earlier = await repo.createScanJob('u1', '', [await storage.put('u/frames/old.jpg', await frame(), 'image/jpeg')])
    await repo.insertGarments([{ ...FIXTURE_TAGS[0], userId: 'u1', status: 'clean', wearLimitOverride: null, wearsSinceWash: 0, wearCount: 0,
      lastWornAt: null, cutoutUrl: '/x.png', photoUrl: earlier.frameUrls[0], confirmed: false }])
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    const unconfirmed = await repo.listGarments('u1', { confirmed: false })
    expect(unconfirmed).toHaveLength(2)
    expect(piecesFromScan(job, unconfirmed).map((g) => g.photoUrl)).toEqual([job.frameUrls[0]])
  })

  test('zero tracks → failed with the retry message', async () => {
    const { repo, storage, job, models } = await setup([])
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    expect(await repo.getScanJob('u1', job.id)).toMatchObject({ status: 'failed', error: NO_CLOTHES })
    expect(NO_CLOTHES).toBe('No clothes found — try holding each piece up to the camera.')
  })

  test('a segmenter crash fails the job instead of hanging it', async () => {
    const { repo, storage, job, models } = await setup([])
    models.segmenter = { segment: async () => { throw new Error('boom') } }
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    expect((await repo.getScanJob('u1', job.id))?.status).toBe('failed')
  })
})

describe('bestFrame and cutout', () => {
  test('bestFrame maximizes area × sharpness', () => {
    const m = (frameIndex: number, area: number): FrameMask => ({ frameIndex, area, maskPng: Buffer.from(''), bbox: [0, 0, 1, 1] })
    const t: SegmentTrack = { trackId: 't', masks: [m(0, 100), m(1, 80), m(2, 120)] }
    const sharp = (x: FrameMask) => [1, 2, 0.5][x.frameIndex]
    expect(bestFrame(t, sharp).frameIndex).toBe(1)
  })
  test('sharpnessUnder measures only the garment: a blurred piece in front of a sharp background scores low', async () => {
    // left half: fine checkerboard (in focus); right half: flat (a blurred shirt)
    const checks = Array.from({ length: 50 }, (_, y) => Array.from({ length: 25 }, (_, x) => ((x + y) % 2 ? `<rect x="${x * 2}" y="${y * 2}" width="2" height="2" fill="white"/>` : '')).join('')).join('')
    const f = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="black"/>${checks}<rect x="50" width="50" height="100" fill="#556b2f"/></svg>`)).jpeg().toBuffer()
    const onSharp = await sharpnessUnder(f, await mask(5, 5, 40, 90)), onBlur = await sharpnessUnder(f, await mask(55, 5, 40, 90))
    expect(onSharp).toBeGreaterThan(onBlur * 5)
  })
  test('cutout makes a transparent PNG trimmed near the mask', async () => {
    const png = await cutout(await frame(), await mask(10, 10, 40, 20))
    const meta = await sharp(png).metadata()
    expect(meta.format).toBe('png')
    expect(meta.hasAlpha).toBe(true)
    expect(meta.width).toBeLessThan(60)
    expect(meta.width).toBeGreaterThanOrEqual(40)
  })
  test('cutout accepts a mask of a different size than the frame', async () => {
    const png = await cutout(await frame(), await mask(0, 0, 60, 40, 120, 80))
    expect((await sharp(png).metadata()).width).toBeGreaterThanOrEqual(50)
  })
})

describe('cleanMask', () => {
  /** W×H grid from rows of '#' (garment) and '.' (background) */
  const grid = (rows: string[]) => ({ on: Uint8Array.from(rows.join('').split(''), (c) => (c === '#' ? 1 : 0)), W: rows[0].length, H: rows.length })
  const show = (m: Uint8Array, W: number) => Array.from({ length: m.length / W }, (_, y) => Array.from(m.slice(y * W, y * W + W), (v) => (v ? '#' : '.')).join(''))
  const block = (W: number, H: number, paint: (x: number, y: number) => boolean) => Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (paint(x, y) ? '#' : '.')).join(''))

  test('fills a small hole inside the piece: a logo or a highlight SAM left out', () => {
    const { on, W } = grid(block(40, 40, (x, y) => x >= 5 && x < 35 && y >= 5 && y < 35 && !(x >= 18 && x < 20 && y >= 18 && y < 20)))
    expect(show(cleanMask(on, W, 40), W)).toEqual(block(40, 40, (x, y) => x >= 5 && x < 35 && y >= 5 && y < 35))
  })

  test('keeps a large opening: a bag handle or the gap between a strap and the body', () => {
    const rows = block(40, 40, (x, y) => x >= 5 && x < 35 && y >= 5 && y < 35 && !(x >= 12 && x < 28 && y >= 12 && y < 28))
    const { on, W } = grid(rows)
    expect(show(cleanMask(on, W, 40), W)).toEqual(rows)
  })

  test('drops specks away from the piece, keeps a real second part', () => {
    const piece = (x: number, y: number) => x >= 2 && x < 30 && y >= 2 && y < 38
    const sleeve = (x: number, y: number) => x >= 32 && x < 38 && y >= 10 && y < 20 // cut off by an arm: 60 px, 6% of the piece
    const speck = (x: number, y: number) => x === 35 && y === 35
    const { on, W } = grid(block(40, 40, (x, y) => piece(x, y) || sleeve(x, y) || speck(x, y)))
    expect(show(cleanMask(on, W, 40), W)).toEqual(block(40, 40, (x, y) => piece(x, y) || sleeve(x, y)))
  })

  test('cutout leaves no hole where the mask had one', async () => {
    const holed = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="black"/><rect x="10" y="10" width="80" height="80" fill="white"/><rect x="50" y="50" width="3" height="3" fill="black"/></svg>')).greyscale().png().toBuffer()
    const { data, info } = await sharp(await cutout(await frame(), holed)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const transparentInside = Array.from({ length: info.width * info.height }).filter((_, i) => {
      const x = i % info.width, y = Math.floor(i / info.width)
      return x > 10 && x < info.width - 10 && y > 10 && y < info.height - 10 && data[i * 4 + 3] < 128
    })
    expect(transparentInside).toHaveLength(0)
  })
})
