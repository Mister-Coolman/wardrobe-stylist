import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { morningExtra, morningNote } from '@/lib/agent/morning'
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

describe('morningExtra', () => {
  const pieces = sampleCloset('u1').map((g, i) => ({ ...g, id: `g${i}` }))
  const coat = pieces.find((g) => g.name === 'Navy wool overcoat')!
  const tee = pieces.find((g) => g.category === 'top')!
  const dry = { tempHighC: 14, tempLowC: 9, rainProbability: 0, windKph: 10, summary: 'Clear' }
  const wet = { ...dry, rainProbability: 80, summary: 'Rain from 17:00' }
  const base = { weather: dry, events: [], worn: [tee], ruleReport: [], laundry: 0, unit: 'F' as const }
  const gap = [{ ruleId: 'weather', passed: true, note: 'Weather: as warm as your closet goes for 2° — a coat would help' }]

  test('cold with no coat says so, in the owner’s unit', () => {
    expect(morningExtra({ ...base, weather: { ...dry, tempLowC: 2 }, ruleReport: gap })).toBe('Cold one, 36° low, and there’s no coat in the closet. Warmest layers it is.')
  })
  test('rain with nothing rain-safe: an umbrella', () => {
    expect(morningExtra({ ...base, weather: wet })).toBe('Rain from 17:00, and nothing here is waterproof. Grab an umbrella.')
  })
  test('rain with a rain-safe piece names it, lowercasing only its first letter', () => {
    expect(morningExtra({ ...base, weather: wet, worn: [tee, { ...coat, name: 'Barbour Bedale jacket' }] })).toBe('Rain from 17:00 — the barbour Bedale jacket handles it.')
  })
  test('a dressy event gives its time, never its title', () => {
    const ev = { id: 'e', userId: 'u1', date: '2026-10-30', start: '18:30', end: null, allDay: false, title: 'divorce hearing', location: null, attendees: [], source: 'user' as const, formality: 4 as const }
    expect(morningExtra({ ...base, events: [ev] })).toBe('Dressed up for your 18:30.')
    expect(morningExtra({ ...base, events: [{ ...ev, start: null }] })).toBe('Dressed up for today.')
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
