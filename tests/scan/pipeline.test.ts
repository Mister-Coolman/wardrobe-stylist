import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, test } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import { getModels } from '@/lib/models'
import type { FrameMask, SegmentTrack, Segmenter, Tagger } from '@/lib/models'
import { FIXTURE_TAGS } from '@/lib/models/fixtures/garments'
import { bestFrame, cutout } from '@/lib/scan/cutout'
import { NO_CLOTHES, runScan } from '@/lib/scan/pipeline'
import { createMemoryStorage } from '@/lib/storage'

const mask = async (x: number, y: number, w: number, h: number, W = 100, H = 100) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/></svg>`)).greyscale().png().toBuffer()
const frame = () => sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 120, g: 90, b: 60 } } }).jpeg().toBuffer()

async function setup(tracks: SegmentTrack[], tags = FIXTURE_TAGS) {
  const repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'scan-')), 'db.json'))
  const storage = createMemoryStorage()
  const frameUrl = await storage.put('u/frames/0.jpg', await frame(), 'image/jpeg')
  const job = await repo.createScanJob('u1', frameUrl, [frameUrl])
  const segmenter: Segmenter = { segment: async () => tracks }
  const byUrl = new Map<string, number>()
  const tagger: Tagger = {
    tag: async (u) => { if (!byUrl.has(u)) byUrl.set(u, byUrl.size); return tags[byUrl.get(u)!] },
    sameItem: async (a, b) => a === b,
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
    const sharp = (i: number) => [1, 2, 0.5][i]
    expect(bestFrame(t, sharp).frameIndex).toBe(1)
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
