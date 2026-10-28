import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import { getModels } from '@/lib/models'
import type { Stylist } from '@/lib/models'
import { safeMediaPath } from '@/lib/storage'
import { washPatch } from '@/lib/garments'
import { planOutfit } from '@/lib/stylist/loop'
import { applyRender } from '@/lib/ui/todayState'
import { isStalled, thinToBudget } from '@/lib/ui/scanUpload'
import { day, garment, profile, wardrobe } from './fixtures/wardrobe'

describe('#1 media paths stay inside the signed-in user’s folder', () => {
  test('rejects dot segments, encoded slashes and other users', () => {
    expect(safeMediaPath(['me', '..%2Fvictim%2Fperson%2F1.jpg'].map(decodeURIComponent), 'me')).toBeNull()
    expect(safeMediaPath(['me', '..', 'victim', 'x.jpg'], 'me')).toBeNull()
    expect(safeMediaPath(['me', 'a\\..\\b.jpg'], 'me')).toBeNull()
    expect(safeMediaPath(['victim', 'x.jpg'], 'me')).toBeNull()
    expect(safeMediaPath(['me', 'cutouts', 'x.png'], 'me')).toBe('me/cutouts/x.png')
  })
})

describe('#2 editing a clean garment keeps its wear count', () => {
  const jeans = garment({ id: 'j', name: 'Jeans', category: 'bottom', subcategory: 'jeans', wearsSinceWash: 4 })
  test('renaming leaves wearsSinceWash alone', () => {
    expect(washPatch(jeans, { name: 'Dark jeans', status: 'clean' })).toEqual({ name: 'Dark jeans', status: 'clean' })
  })
  test('moving out of the laundry resets the count', () => {
    expect(washPatch({ ...jeans, status: 'laundry' }, { status: 'clean' })).toEqual({ status: 'clean', wearsSinceWash: 0 })
  })
})

describe('#3 a late render never lands on a different look', () => {
  const plan = (id: string) => ({ result: { ok: true as const, outfit: { id, renderMode: 'none' as const, renderUrl: null } } })
  test('applies to the outfit it was requested for', () => {
    expect(applyRender(plan('a'), 'a', { renderMode: 'flatlay', renderUrl: '/r.jpg' }).result.outfit.renderUrl).toBe('/r.jpg')
  })
  test('ignored once the look has changed', () => {
    const p = plan('b')
    expect(applyRender(p, 'a', { renderMode: 'flatlay', renderUrl: '/r.jpg' })).toBe(p)
  })
})

describe('#5 unknown garment ids never produce an empty look', () => {
  test('all-unknown ids every round → a best-effort look made of real pieces', async () => {
    const junk = [{ garmentIds: ['ghost-1', 'ghost-2', 'ghost-3'], rationale: {}, title: 'Ghost' }]
    const stylist: Stylist = { ...getModels().stylist, propose: async () => junk, revise: async () => junk }
    const r = await planOutfit({ day: day(), wardrobe, profile, models: { ...getModels(), stylist }, renderMode: 'none' })
    if (!r.ok) throw new Error('expected an outfit')
    const ids = new Set(wardrobe.map((g) => g.id))
    expect(r.outfit.garmentIds.length).toBeGreaterThanOrEqual(3)
    expect(r.outfit.garmentIds.every((id) => ids.has(id))).toBe(true)
  })
  test('one unknown id is dropped from the look, not kept', async () => {
    const one = [{ garmentIds: ['coat', 'crew', 'trousers', 'boots', 'ghost'], rationale: {}, title: 'Mostly real' }]
    const stylist: Stylist = { ...getModels().stylist, propose: async () => one, revise: async () => one }
    const r = await planOutfit({ day: day({ requiredFormality: 3 }), wardrobe, profile, models: { ...getModels(), stylist }, renderMode: 'none' })
    if (!r.ok) throw new Error('expected an outfit')
    expect(r.outfit.garmentIds).not.toContain('ghost')
  })
})

describe('#6 "I wore this" counts once per outfit per day', () => {
  test('a second logWear for the same outfit and date is ignored and hasWorn reports it', async () => {
    const repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'wear-')), 'db.json'))
    await repo.upsertProfile(profile)
    const [g] = await repo.insertGarments([{ ...garment({ id: 'x', name: 'Jeans', category: 'bottom', subcategory: 'jeans' }), id: undefined } as never])
    const o = await repo.saveOutfit({ userId: 'u1', garmentIds: [g.id], rationale: {}, title: 'T', contextDate: '2026-10-27', ruleReport: [], revisionLog: [], renderMode: 'none', renderUrl: null, source: 'agent' })
    expect(await repo.hasWorn('u1', o.id, '2026-10-27')).toBe(false)
    await repo.logWear('u1', o.id, '2026-10-27')
    await repo.logWear('u1', o.id, '2026-10-27')
    expect((await repo.listGarments('u1'))[0].wearsSinceWash).toBe(1)
    expect(await repo.hasWorn('u1', o.id, '2026-10-27')).toBe(true)
  })
})

describe('#7 scan uploads fit a serverless request', () => {
  test('thins frames evenly until the total fits the budget, keeping first and last', () => {
    const sizes = Array(60).fill(150_000)
    const keep = thinToBudget(sizes, 4_000_000)
    expect(keep.reduce((s, i) => s + sizes[i], 0)).toBeLessThanOrEqual(4_000_000)
    expect(keep[0]).toBe(0)
    expect(keep.at(-1)).toBe(59)
    expect(keep.length).toBeGreaterThan(20)
  })
  test('small uploads are untouched', () => expect(thinToBudget([10, 10, 10], 100)).toEqual([0, 1, 2]))
})

describe('#8 a stalled scan gives up', () => {
  test('no status or progress change for 90 s is a stall', () => {
    expect(isStalled({ key: 'tagging:0.5', since: 0 }, 'tagging:0.5', 91_000)).toBe(true)
    expect(isStalled({ key: 'tagging:0.5', since: 0 }, 'tagging:0.5', 30_000)).toBe(false)
    expect(isStalled({ key: 'tagging:0.5', since: 0 }, 'tagging:0.6', 91_000)).toBe(false)
  })
})
