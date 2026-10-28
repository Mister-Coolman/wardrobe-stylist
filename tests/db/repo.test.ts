import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Runs against the local JSON store, and against a live Supabase project with SUPABASE_CONTRACT=1:
//   set -a; . ./.env.local; set +a; SUPABASE_CONTRACT=1 npx vitest run tests/db/repo.test.ts
// The live run deletes every row belonging to the test users (u1, someone-else) before each test and at the end.
import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import { createSupabaseRepo } from '@/lib/db/supabase'
import { garment, profile } from '../fixtures/wardrobe'

const TEST_USERS = ['u1', 'someone-else']
async function clearSupabase() {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
  // wear_logs and poll_votes go with their outfits and polls
  for (const t of ['polls', 'outfits', 'garments', 'events', 'trips', 'scan_jobs', 'profiles']) {
    const { error } = await db.from(t).delete().in('user_id', TEST_USERS)
    if (error) throw new Error(`${t}: ${error.message}`)
  }
}

const live = process.env.SUPABASE_CONTRACT === '1' && !!process.env.SUPABASE_URL
const stores: [string, () => Promise<Repo>][] = [
  ['local repo', async () => createLocalRepo(join(mkdtempSync(join(tmpdir(), 'ws-')), 'db.json'))],
  ...(live ? [['supabase repo', async () => { await clearSupabase(); return createSupabaseRepo() }] as [string, () => Promise<Repo>]] : []),
]

let repo: Repo
if (live) afterAll(clearSupabase, 30_000)

const strip = <T extends { id: string }>({ id: _id, ...rest }: T) => rest

describe.each(stores)('%s', (_name, make) => {
  beforeEach(async () => { repo = await make() }, 30_000)

  test('logWear counts only the worn pieces, and other users see nothing', async () => {
    await repo.upsertProfile(profile)
    const [a, b] = await repo.insertGarments([
      strip(garment({ id: 'x', name: 'Selvedge jeans', category: 'bottom', subcategory: 'jeans' })),
      strip(garment({ id: 'y', name: 'Oat crewneck', category: 'top', subcategory: 'sweater' })),
    ])
    const outfit = await repo.saveOutfit({ userId: 'u1', garmentIds: [a.id], rationale: {}, title: 'T', contextDate: '2026-10-27',
      ruleReport: [], revisionLog: [], renderMode: 'none', renderUrl: null, source: 'agent' })
    await repo.logWear('u1', outfit.id, '2026-10-27')
    const gs = await repo.listGarments('u1')
    const ga = gs.find((g) => g.id === a.id)!, gb = gs.find((g) => g.id === b.id)!
    expect(ga.wearCount).toBe(1)
    expect(ga.wearsSinceWash).toBe(1)
    expect(ga.lastWornAt).toBe('2026-10-27')
    expect(ga.status).toBe('clean')
    expect(gb.wearCount).toBe(0)
    expect(await repo.listGarments('someone-else')).toEqual([])
  })

  test('logWear moves a piece to the laundry when it reaches its wear limit', async () => {
    await repo.upsertProfile(profile)
    const [tee] = await repo.insertGarments([strip(garment({ id: 't', name: 'Rust tee', category: 'top', subcategory: 'tshirt' }))])
    const o = await repo.saveOutfit({ userId: 'u1', garmentIds: [tee.id], rationale: {}, title: 'T', contextDate: '2026-10-27',
      ruleReport: [], revisionLog: [], renderMode: 'none', renderUrl: null, source: 'agent' })
    await repo.logWear('u1', o.id, '2026-10-27')
    expect((await repo.listGarments('u1'))[0].status).toBe('laundry')
  })

  test('garment update, delete and confirmed filter are scoped by user', async () => {
    const [g] = await repo.insertGarments([{ ...strip(garment({ id: 'z', name: 'Coat', category: 'outerwear', subcategory: 'coat' })), confirmed: false }])
    expect(await repo.listGarments('u1', { confirmed: true })).toEqual([])
    await repo.updateGarment('someone-else', g.id, { confirmed: true })
    expect(await repo.listGarments('u1', { confirmed: true })).toEqual([])
    await repo.updateGarment('u1', g.id, { confirmed: true })
    expect(await repo.listGarments('u1', { confirmed: true })).toHaveLength(1)
    await repo.deleteGarment('someone-else', g.id)
    expect(await repo.listGarments('u1')).toHaveLength(1)
    await repo.deleteGarment('u1', g.id)
    expect(await repo.listGarments('u1')).toEqual([])
  })

  test('latestOutfitFor returns the newest outfit for the date', async () => {
    const base = { userId: 'u1', rationale: {}, contextDate: '2026-10-27', ruleReport: [], revisionLog: [], renderMode: 'none' as const, renderUrl: null, source: 'agent' as const }
    await repo.saveOutfit({ ...base, garmentIds: ['a'], title: 'First' })
    await repo.saveOutfit({ ...base, garmentIds: ['b'], title: 'Second' })
    expect((await repo.latestOutfitFor('u1', '2026-10-27'))?.title).toBe('Second')
    expect(await repo.latestOutfitFor('u1', '2026-10-28')).toBeNull()
  })

  test('user events, scan jobs and trips round-trip', async () => {
    await repo.addUserEvent({ userId: 'u1', date: '2026-10-27', start: null, end: null, allDay: false, title: 'Drinks', location: null, attendees: [], source: 'user' })
    expect((await repo.listUserEvents('u1', '2026-10-27')).map((e) => e.title)).toEqual(['Drinks'])
    const job = await repo.createScanJob('u1', '/m/v.webm', ['/m/0.jpg'])
    expect(job.status).toBe('queued')
    await repo.updateScanJob(job.id, { status: 'review', foundCount: 3 })
    expect((await repo.getScanJob('u1', job.id))?.foundCount).toBe(3)
    expect(await repo.getScanJob('other', job.id)).toBeNull()
    const trip = await repo.saveTrip({ userId: 'u1', destination: 'Chicago', lat: 41.9, lon: -87.6, startDate: '2026-10-29', endDate: '2026-10-31', dayPlans: [], packingList: [], warnings: [] })
    expect((await repo.getTrip('u1', trip.id))?.destination).toBe('Chicago')
    expect(await repo.listTrips('u1')).toHaveLength(1)
  })

  test('every record type round-trips unchanged', async () => {
    const p = { ...profile, styleProfile: { summary: 's', traits: ['a'], palette: ['navy'], avoid: [], sourceImages: ['/x.png'] }, wearLimits: { jeans: 5, tshirt: null } }
    await repo.upsertProfile(p)
    expect(await repo.getProfile('u1')).toEqual(p)
    expect(await repo.getProfile('someone-else')).toBeNull()

    const input = strip(garment({ id: 'x', name: 'Selvedge jeans', category: 'bottom', subcategory: 'jeans', lastWornAt: '2026-10-20', wearLimitOverride: 3 }))
    const [g] = await repo.insertGarments([input])
    expect(strip(g)).toEqual(input)
    expect(strip((await repo.listGarments('u1'))[0])).toEqual(input)

    const o = { userId: 'u1', garmentIds: [g.id], rationale: { [g.id]: 'why' }, title: 'T', contextDate: '2026-10-27',
      ruleReport: [{ rule: 'weather', passed: true, note: 'n' }], revisionLog: [], renderMode: 'flatlay' as const, renderUrl: null, source: 'user' as const }
    const saved = await repo.saveOutfit(o as never)
    expect(strip(saved)).toEqual(o)
    expect(await repo.getOutfit('u1', saved.id)).toEqual(saved)
    expect(await repo.getOutfit('someone-else', saved.id)).toBeNull()
    await repo.updateOutfit('u1', saved.id, { renderUrl: '/r.png' })
    expect((await repo.listOutfitsFor('u1', '2026-10-27')).map((x) => x.renderUrl)).toEqual(['/r.png'])

    const e = { userId: 'u1', date: '2026-10-27', start: '18:00', end: '19:30', allDay: false, title: 'Drinks', location: null, attendees: ['a@b.c'], source: 'user' as const }
    const ev = await repo.addUserEvent(e)
    expect(strip(ev)).toMatchObject(e)
    expect(await repo.listUserEvents('u1', '2026-10-27')).toEqual([ev])

    const t = { userId: 'u1', destination: 'Chicago', lat: 41.88, lon: -87.63, startDate: '2026-11-05', endDate: '2026-11-07',
      dayPlans: [{ date: '2026-11-05', outfitId: saved.id, note: '' }], packingList: [{ garmentId: g.id, days: 2 }], warnings: ['w'] }
    const trip = await repo.saveTrip(t)
    expect(strip(trip)).toEqual(t)
    expect(await repo.getTrip('u1', trip.id)).toEqual(trip)
    expect(await repo.listTrips('u1')).toEqual([trip])

    const job = await repo.createScanJob('u1', '/v.mp4', ['/f0.jpg', '/f1.jpg'])
    expect(job).toMatchObject({ userId: 'u1', mediaUrl: '/v.mp4', frameUrls: ['/f0.jpg', '/f1.jpg'], status: 'queued', progress: 0, foundCount: 0, error: null })
    await repo.updateScanJob(job.id, { status: 'review', progress: 0.5, foundCount: 3 })
    expect(await repo.getScanJob('u1', job.id)).toMatchObject({ status: 'review', progress: 0.5, foundCount: 3 })
    expect(await repo.getScanJob('someone-else', job.id)).toBeNull()
  }, 60_000)

  test('wear is logged once per outfit per day', async () => {
    await repo.upsertProfile(profile)
    const [g] = await repo.insertGarments([strip(garment({ id: 'x', name: 'Selvedge jeans', category: 'bottom', subcategory: 'jeans' }))])
    const o = await repo.saveOutfit({ userId: 'u1', garmentIds: [g.id], rationale: {}, title: 'T', contextDate: '2026-10-27',
      ruleReport: [], revisionLog: [], renderMode: 'none', renderUrl: null, source: 'agent' })
    expect(await repo.hasWorn('u1', o.id, '2026-10-27')).toBe(false)
    await repo.logWear('u1', o.id, '2026-10-27')
    await repo.logWear('u1', o.id, '2026-10-27')
    expect(await repo.hasWorn('u1', o.id, '2026-10-27')).toBe(true)
    expect((await repo.listGarments('u1'))[0].wearCount).toBe(1)
  }, 60_000)

  test('polls: one vote per voter, invalid outfits refused, tally counts', async () => {
    const poll = await repo.createPoll('u1', ['o1', 'o2'].map(() => crypto.randomUUID()), '2026-10-27')
    const [a, b] = poll.outfitIds
    expect(await repo.getPoll(poll.slug)).toEqual(poll)
    expect(await repo.latestPollFor('u1', '2026-10-27')).toEqual(poll)
    expect(await repo.vote(poll.slug, a, 'v1')).toBe('ok')
    expect(await repo.vote(poll.slug, b, 'v1')).toBe('duplicate')
    expect(await repo.vote(poll.slug, b, 'v2')).toBe('ok')
    expect(await repo.vote(poll.slug, crypto.randomUUID(), 'v3')).toBe('invalid')
    expect(await repo.tally(poll.slug)).toEqual({ [a]: 1, [b]: 1 })
  }, 60_000)
})
