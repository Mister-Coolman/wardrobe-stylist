import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import { rotateCutout } from '@/lib/garments'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'
import { createMemoryStorage, userKey } from '@/lib/storage'

async function setup() {
  const repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'rotate-')), 'db.json'))
  const storage = createMemoryStorage()
  const wide = await sharp({ create: { width: 60, height: 30, channels: 4, background: { r: 20, g: 30, b: 90, alpha: 1 } } }).png().toBuffer()
  const url = await storage.put(`${userKey('u1')}/cutouts/wide.png`, wide, 'image/png')
  const [g] = sampleCloset('u1').slice(0, 1)
  await repo.insertGarments([{ ...g, cutoutUrl: url, photoUrl: url, confirmed: true }])
  const [piece] = await repo.listGarments('u1')
  return { repo, storage, piece }
}

test('rotating a piece turns its cutout a quarter turn clockwise, under a new url', async () => {
  const { repo, storage, piece } = await setup()
  const url = await rotateCutout(repo, storage, 'u1', piece.id)
  expect(url).not.toBe(piece.cutoutUrl)
  const m = await sharp(await storage.read(url!)).metadata()
  expect([m.width, m.height]).toEqual([30, 60])
  // a piece whose photo is its cutout (a demo copy, a listing) shows the turned one everywhere
  expect((await repo.listGarments('u1'))[0]).toMatchObject({ cutoutUrl: url, photoUrl: url })
})

test('another owner’s piece, or one with no stored cutout, is not rotated', async () => {
  const { repo, storage, piece } = await setup()
  expect(await rotateCutout(repo, storage, 'u2', piece.id)).toBeNull()
  await repo.updateGarment('u1', piece.id, { cutoutUrl: '/fixtures/garments/tee.png' })
  expect(await rotateCutout(repo, storage, 'u1', piece.id)).toBeNull()
})
