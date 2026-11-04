import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test, vi } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'
import { defaultProfile } from '@/lib/profile'
import { createMemoryStorage, MEDIA_PREFIX, userKey } from '@/lib/storage'
import type { StorageLike } from '@/lib/storage'
import { DEMO_DAILY_CAP, demoEvents, demoSession, isDemo, signDemo, startDemo } from '@/lib/demo'

const OWNER = 'owner@example.com'
let repo: Repo, storage: StorageLike
const now = new Date('2026-11-03T14:00:00Z')

beforeEach(async () => {
  vi.stubEnv('AUTH_SECRET', 'test-secret')
  repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'demo-')), 'db.json'))
  storage = createMemoryStorage()
  await repo.upsertProfile({ ...defaultProfile(OWNER), personPhotoUrl: '/api/media/x/me.jpg', whatsappId: '15185550000' })
  const [first, ...rest] = sampleCloset(OWNER)
  const cutout = await storage.put(`${userKey(OWNER)}/cutouts/polo.png`, Buffer.from('png'), 'image/png')
  await repo.insertGarments([{ ...first, cutoutUrl: cutout, photoUrl: `${MEDIA_PREFIX}${userKey(OWNER)}/frames/f1.jpg` }, ...rest, { ...first, name: 'Unconfirmed', confirmed: false }])
})

test('a demo user gets a copy of the owner’s confirmed closet, cutouts copied under their own key, and a plain profile', async () => {
  const id = await startDemo(repo, storage, OWNER, now)
  expect(isDemo(id!)).toBe(true)
  const mine = await repo.listGarments(id!)
  expect(mine).toHaveLength(sampleCloset(OWNER).length)
  expect(mine.map((g) => g.name)).not.toContain('Unconfirmed')
  const polo = mine.find((g) => g.cutoutUrl.startsWith(MEDIA_PREFIX))!
  expect(polo.cutoutUrl).toBe(`${MEDIA_PREFIX}${userKey(id!)}/cutouts/polo.png`)
  expect((await storage.read(polo.cutoutUrl)).toString()).toBe('png')
  expect(polo.photoUrl).toBe(polo.cutoutUrl)
  const p = (await repo.getProfile(id!))!
  expect(p.personPhotoUrl).toBeNull()
  expect(p.whatsappId ?? null).toBeNull()
  expect(p.renderMode).toBe('flatlay')
  expect((await repo.listGarments(OWNER)).length).toBe(sampleCloset(OWNER).length + 1)
})

test('no more than the daily cap of demo users', async () => {
  for (let i = 0; i < DEMO_DAILY_CAP; i++) await repo.upsertProfile(defaultProfile(`demo-20261103-${i}@demo.wardrobe-stylist.xyz`))
  expect(await startDemo(repo, storage, OWNER, now)).toBeNull()
  expect(await startDemo(repo, storage, OWNER, new Date('2026-11-04T14:00:00Z'))).not.toBeNull()
})

test('no demo without an owner closet', async () => {
  expect(await startDemo(repo, storage, 'nobody@example.com', now)).toBeNull()
})

test('the cookie only signs in as a demo user it was signed for', async () => {
  const id = (await startDemo(repo, storage, OWNER, now))!
  expect(demoSession(signDemo(id))).toEqual({ userId: id, email: id, googleAccessToken: null })
  expect(demoSession(signDemo(id).replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')))).toBeNull()
  expect(demoSession(`${OWNER}.${signDemo(OWNER).split('.').pop()}`)).toBeNull()
  expect(demoSession(undefined)).toBeNull()
  vi.stubEnv('AUTH_SECRET', '')
  expect(demoSession(signDemo(id))).toBeNull()
})

test('a demo day has sample events on whatever date it is', () => {
  const evs = demoEvents('demo-x@demo.wardrobe-stylist.xyz', '2026-11-09')
  expect(evs.map((e) => e.title)).toEqual(['Lunch with friends', 'Drinks after work'])
  expect(evs.map((e) => [e.date, e.start])).toEqual([['2026-11-09', '12:30'], ['2026-11-09', '18:30']])
})
