import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import { duplicateGarment } from '@/lib/garments'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'

let repo: Repo
beforeEach(async () => {
  repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'dup-')), 'db.json'))
  await repo.insertGarments(sampleCloset('u1').map((g) => ({ ...g, confirmed: true })))
})

test('a copy is a new piece with the same details, starting clean with no wears; the original is untouched', async () => {
  const [g] = await repo.listGarments('u1')
  await repo.updateGarment('u1', g.id, { status: 'laundry', wearsSinceWash: 3, wearCount: 9, lastWornAt: '2026-10-29', brand: 'Under Armour', wearLimitOverride: 2 })
  const before = (await repo.listGarments('u1')).find((x) => x.id === g.id)!
  const [copy] = await duplicateGarment(repo, 'u1', g.id)
  expect(copy.id).not.toBe(g.id)
  expect(copy).toMatchObject({ name: before.name, brand: 'Under Armour', category: before.category, colors: before.colors, cutoutUrl: before.cutoutUrl,
    wearLimitOverride: 2, confirmed: true, status: 'clean', wearsSinceWash: 0, wearCount: 0, lastWornAt: null })
  expect((await repo.listGarments('u1')).find((x) => x.id === g.id)).toEqual(before)
  expect(await repo.listGarments('u1')).toHaveLength(sampleCloset('u1').length + 1)
})

test('count makes several copies, capped at 5', async () => {
  const [g] = await repo.listGarments('u1')
  expect(await duplicateGarment(repo, 'u1', g.id, 2)).toHaveLength(2)
  expect(await duplicateGarment(repo, 'u1', g.id, 50)).toHaveLength(5)
})

test('someone else’s piece is not copied', async () => {
  const [g] = await repo.listGarments('u1')
  expect(await duplicateGarment(repo, 'someone-else', g.id)).toEqual([])
  expect(await repo.listGarments('someone-else')).toEqual([])
})
