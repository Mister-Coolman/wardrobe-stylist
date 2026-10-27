import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import { garment, profile } from '../fixtures/wardrobe'

let repo: Repo
beforeEach(() => { repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'ws-')), 'db.json')) })

const strip = <T extends { id: string }>({ id: _id, ...rest }: T) => rest

describe('local repo', () => {
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
})
