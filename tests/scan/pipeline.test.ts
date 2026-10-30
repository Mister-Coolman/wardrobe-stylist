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
import { frameSeconds, NO_CLOTHES, piecesFromScan, runScan } from '@/lib/scan/pipeline'
import { createMemoryStorage } from '@/lib/storage'

const mask = async (x: number, y: number, w: number, h: number, W = 100, H = 100) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/></svg>`)).greyscale().png().toBuffer()
const frame = () => sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 120, g: 90, b: 60 } } }).jpeg().toBuffer()

/** left half red, right half blue */
const twoColorFrame = () => sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="100" fill="#c02020"/><rect x="50" width="50" height="100" fill="#2030c0"/></svg>')).jpeg().toBuffer()

/** opts.frames: how many video frames the job has (each the same image); default one photo. opts.msPerFrame: name
 *  the frames with their times, as the scan route stores them */
async function setup(tracks: SegmentTrack[], tags = FIXTURE_TAGS, opts: { frame?: Buffer; frames?: number; msPerFrame?: number; sameItem?: Tagger['sameItem'] } = {}) {
  const repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'scan-')), 'db.json'))
  const storage = createMemoryStorage()
  const image = opts.frame ?? await frame()
  const frameUrls = await Promise.all(Array.from({ length: opts.frames ?? 1 }, (_, i) => storage.put(opts.msPerFrame ? `u/frames/frame-${i}-${i * opts.msPerFrame}ms.jpg` : `u/frames/${i}.jpg`, image, 'image/jpeg')))
  const job = await repo.createScanJob('u1', frameUrls[0], frameUrls)
  const segmenter: Segmenter = { segment: async () => tracks }
  const byUrl = new Map<string, number>()
  const tagger: Tagger = {
    tag: async (u) => { if (!byUrl.has(u)) byUrl.set(u, byUrl.size); return tags[byUrl.get(u)!] },
    sameItem: opts.sameItem ?? (async (a, b) => a === b),
  }
  const models = { ...getModels(), segmenter, tagger }
  return { repo, storage, job, models }
}
const track = async (id: string, r: [number, number, number, number], frames = [0]): Promise<SegmentTrack> =>
  ({ trackId: id, masks: await Promise.all(frames.map(async (frameIndex) => ({ frameIndex, maskPng: await mask(...r), area: r[2] * r[3], bbox: r }))) })

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

  test('two lookalike pieces with an empty stretch between them are different pieces, and never compared', async () => {
    // measured on a hold-up clip: two green Nautica polos hung one after the other, the door empty for 4 frames between
    let asked = 0
    const { repo, storage, job, models } = await setup([await track('green', [10, 10, 60, 80], [19, 20, 21]), await track('green2', [10, 10, 60, 80], [26, 27, 28])],
      FIXTURE_TAGS, { frames: 30, sameItem: async () => { asked++; return true } })
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    expect(asked).toBe(0)
    expect(await repo.listGarments('u1')).toHaveLength(2)
  })

  test('a piece picked up again right after itself is compared even when blur changed its colour, and the view held longest kept', async () => {
    // measured: a red polo caught half in frame, close and blurred, for one frame while being hung; then hanging still
    // for four. The blurred half covered more of the frame, so area would keep the wrong one.
    const top = FIXTURE_TAGS.find((t) => t.category === 'top')!
    const checks = Array.from({ length: 50 }, (_, y) => Array.from({ length: 25 }, (_, x) => ((x + y) % 2 ? `<rect x="${x * 2}" y="${y * 2}" width="2" height="2" fill="#ff8080"/>` : '')).join('')).join('')
    const crispLeftBlurredRight = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="50" height="100" fill="#c02020"/>${checks}<rect x="50" width="50" height="100" fill="#e04060"/></svg>`)).jpeg({ quality: 100 }).toBuffer()
    const asked: string[][] = []
    const { repo, storage, job, models } = await setup([await track('blurred half', [50, 0, 50, 100], [33]), await track('hanging', [5, 10, 40, 80], [34, 35, 36])],
      [top, { ...top, category: 'outerwear' }], { frame: crispLeftBlurredRight, frames: 40, sameItem: async (a, b) => { asked.push([a, b]); return true } })
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    expect(asked).toHaveLength(1)
    const gs = await repo.listGarments('u1')
    expect(gs).toHaveLength(1)
    expect(gs[0].photoUrl).not.toBe(job.frameUrls[33])
  })

  test('a piece seen once, while being hung, is compared with the piece hanging 2.3 s later; two still pieces 2.9 s apart are not', async () => {
    // measured at 1.75 frames/s: a black polo caught once at frame 14 while being hung, then hanging still from frame 18
    let asked = 0
    const sameItem = async () => { asked++; return true }
    const once = await setup([await track('caught once', [10, 10, 60, 80], [14]), await track('hanging', [10, 10, 60, 80], [18, 19, 20, 21, 22])],
      FIXTURE_TAGS, { frames: 30, msPerFrame: 571, sameItem })
    await runScan(once.job.id, { userId: 'u1', models: once.models, repo: once.repo, storage: once.storage })
    expect(asked).toBe(1)
    expect(await once.repo.listGarments('u1')).toHaveLength(1)

    asked = 0
    const still = await setup([await track('a', [10, 10, 60, 80], [10, 11, 12, 13, 14]), await track('b', [10, 10, 60, 80], [19, 20, 21, 22, 23])],
      FIXTURE_TAGS, { frames: 30, msPerFrame: 571, sameItem })
    await runScan(still.job.id, { userId: 'u1', models: still.models, repo: still.repo, storage: still.storage })
    expect(asked).toBe(0)
    expect(await still.repo.listGarments('u1')).toHaveLength(2)
  })

  test('frame times come from the stored frame name, in seconds; without one, a frame a second', () => {
    expect(frameSeconds('/api/media/u/scans/s/frame-004-2500ms.jpg', 4)).toBe(2.5)
    expect(frameSeconds('/api/media/u/scans/s/frame-004.jpg', 4)).toBe(4)
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

  test('hangers are asked for once per chosen frame, and a failed hanger call still makes the cutout', async () => {
    const { repo, storage, job, models } = await setup([await track('a', [0, 0, 40, 40]), await track('b', [50, 50, 40, 40])])
    const asked: string[] = []
    models.segmenter = { ...models.segmenter, hangers: async (u) => { asked.push(u); throw new Error('sam down') } }
    await runScan(job.id, { userId: 'u1', models, repo, storage })
    expect(asked).toEqual([job.frameUrls[0]])
    expect(await repo.listGarments('u1')).toHaveLength(2)
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

describe('cutout finishing', () => {
  const svg = (body: string, W = 100, H = 100) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`))
  const rgbaOf = async (png: Buffer) => sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  /** mean RGB of fully opaque pixels */
  const opaqueMean = async (png: Buffer) => {
    const { data, info } = await rgbaOf(png)
    const sum = [0, 0, 0]; let n = 0
    for (let i = 0; i < info.width * info.height; i++) if (data[i * 4 + 3] === 255) { sum[0] += data[i * 4]; sum[1] += data[i * 4 + 1]; sum[2] += data[i * 4 + 2]; n++ }
    return sum.map((v) => v / n)
  }
  const piece = (fill: string, wall: string) => svg(`<rect width="100" height="100" fill="${wall}"/><rect x="30" y="20" width="40" height="60" fill="${fill}"/>`).jpeg({ quality: 100 }).toBuffer()
  const pieceMask = () => mask(30, 20, 40, 60)

  test('a hanger mask is cut out, and the hook above the collar goes with it', async () => {
    const shirtAndHook = await svg('<rect width="100" height="100" fill="black"/><rect x="20" y="30" width="60" height="60" fill="white"/><rect x="47" y="5" width="6" height="25" fill="white"/>').greyscale().png().toBuffer()
    const hanger = await svg('<rect width="100" height="100" fill="black"/><rect x="40" y="0" width="20" height="31" fill="white"/>').greyscale().png().toBuffer()
    const withHook = await sharp(await cutout(await frame(), shirtAndHook)).metadata()
    const without = await sharp(await cutout(await frame(), shirtAndHook, { minus: [hanger] })).metadata()
    expect(withHook.height).toBeGreaterThan(85)
    expect(without.height).toBeLessThan(72) // 60 px of shirt + padding
  })

  test('edges are softened: the outline is partly transparent, the inside fully opaque', async () => {
    const { data, info } = await rgbaOf(await cutout(await frame(), await pieceMask()))
    const alphas = Array.from({ length: info.width * info.height }, (_, i) => data[i * 4 + 3])
    expect(alphas.some((a) => a > 0 && a < 255)).toBe(true)
    expect(alphas[Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)]).toBe(255)
  })

  test('a warm cast measured on a plain light wall is taken out of the piece', async () => {
    // a grey shirt on a white wall, both under orange lamp light
    const [r, g, b] = await opaqueMean(await cutout(await piece('rgb(120,100,75)', 'rgb(235,200,150)'), await pieceMask()))
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(12)
  })

  test('a dim room is brightened, judged by the wall, and a black piece stays dark', async () => {
    const before = (await opaqueMean(await cutout(await piece('rgb(90,90,90)', 'rgb(200,200,200)'), await pieceMask())))[0]
    const dim = (await opaqueMean(await cutout(await piece('rgb(45,45,45)', 'rgb(110,110,110)'), await pieceMask())))[0]
    expect(dim).toBeGreaterThan(60)
    expect(dim).toBeLessThan(before + 15)
    const black = (await opaqueMean(await cutout(await piece('rgb(15,15,15)', 'rgb(110,110,110)'), await pieceMask())))[0]
    expect(black).toBeLessThan(40)
  })

  test('busy or colourful surroundings (a wood door, the next shirt) leave the colours alone', async () => {
    const stripes = Array.from({ length: 25 }, (_, i) => `<rect x="${i * 4}" width="2" height="100" fill="${i % 2 ? '#3b2412' : '#c8945a'}"/>`).join('')
    const busy = await svg(`<rect width="100" height="100" fill="#7a4a24"/>${stripes}<rect x="30" y="20" width="40" height="60" fill="rgb(150,40,40)"/>`).jpeg({ quality: 100 }).toBuffer()
    const [r, g, b] = await opaqueMean(await cutout(busy, await pieceMask()))
    expect([r, g, b].map((v) => Math.round(v / 10))).toEqual([15, 4, 4])
  })
})

