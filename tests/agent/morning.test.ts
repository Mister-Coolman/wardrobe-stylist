import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { morningNote } from '@/lib/agent/morning'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'
import { defaultProfile } from '@/lib/profile'

let repo: Repo
const profile = { ...defaultProfile('u1'), renderMode: 'none' as const }
beforeEach(async () => {
  vi.stubEnv('WEATHER', 'fixture')
  repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'morning-')), 'db.json'))
  await repo.upsertProfile(profile)
})
const closet = () => repo.insertGarments(sampleCloset('u1').map((g) => ({ ...g, confirmed: true })))

describe('morningNote', () => {
  test('sends one note with an outfit card, and the rain line on the fixture’s rainy day', async () => {
    await closet()
    const send = vi.fn(async () => {})
    const m = await morningNote(repo, profile, { send })
    expect(m).toMatchObject({ role: 'assistant', channel: 'system', cards: [{ kind: 'outfit' }] })
    expect(m!.text).toMatch(/^Morning\. .+: .+\./)
    expect(m!.text).toMatch(/Rain from 17:00/)
    expect(send).toHaveBeenCalledOnce()
    expect(await repo.listMessages('u1')).toHaveLength(1)
  })

  test('a second run the same day sends nothing', async () => {
    await closet()
    await morningNote(repo, profile, {})
    expect(await morningNote(repo, profile, {})).toBeNull()
    expect(await repo.listMessages('u1')).toHaveLength(1)
  })

  test('fewer than 3 pieces: nothing', async () => {
    await repo.insertGarments(sampleCloset('u1').slice(0, 2).map((g) => ({ ...g, confirmed: true })))
    expect(await morningNote(repo, profile, {})).toBeNull()
  })

  test('no clean bottoms: the wash-day line, no card', async () => {
    await closet()
    for (const g of await repo.listGarments('u1')) if (g.category === 'bottom') await repo.updateGarment('u1', g.id, { status: 'laundry' })
    const m = await morningNote(repo, profile, {})
    expect(m!.text).toBe('Morning. No clean bottom today — wash day?')
    expect(m!.cards).toEqual([])
  })
})

describe('cron route', () => {
  test('refuses without the secret', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret')
    const { GET } = await import('@/app/api/cron/morning/route')
    expect((await GET(new Request('http://x/api/cron/morning'))).status).toBe(401)
    expect((await GET(new Request('http://x/api/cron/morning', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401)
  })
})
