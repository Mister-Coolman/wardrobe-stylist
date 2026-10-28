import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import { pollWinner } from '@/lib/rules/pollWinner'
import { pollResult, voterKey } from '@/lib/polls'
import { cand, ctx } from './fixtures/wardrobe'

let repo: Repo
const outfit = (garmentIds: string[]) => repo.saveOutfit({ userId: 'u1', garmentIds, rationale: {}, title: 'Look', contextDate: '2026-10-27',
  ruleReport: [], revisionLog: [], renderMode: 'none', renderUrl: null, source: 'agent' })
beforeEach(() => { repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'poll-')), 'db.json')) })

describe('polls', () => {
  test('slug is 8 characters and the poll is readable without a user', async () => {
    const [a, b] = [await outfit(['coat']), await outfit(['crew'])]
    const p = await repo.createPoll('u1', [a.id, b.id], '2026-10-27')
    expect(p.slug).toMatch(/^[\w-]{8}$/)
    expect((await repo.getPoll(p.slug))?.outfitIds).toEqual([a.id, b.id])
  })
  test('a second vote with the same key is rejected; votes for outfits outside the poll are invalid', async () => {
    const [a, b] = [await outfit(['coat']), await outfit(['crew'])]
    const p = await repo.createPoll('u1', [a.id, b.id], '2026-10-27')
    expect(await repo.vote(p.slug, a.id, 'k1')).toBe('ok')
    expect(await repo.vote(p.slug, b.id, 'k1')).toBe('duplicate')
    expect(await repo.vote(p.slug, 'nope', 'k2')).toBe('invalid')
    expect(await repo.vote('missing', a.id, 'k3')).toBe('invalid')
  })
  test('tally and winner', async () => {
    const [a, b] = [await outfit(['coat']), await outfit(['crew'])]
    const p = await repo.createPoll('u1', [a.id, b.id], '2026-10-27')
    for (const k of ['1', '2', '3', '4', '5']) await repo.vote(p.slug, b.id, k)
    for (const k of ['6', '7']) await repo.vote(p.slug, a.id, k)
    const r = pollResult(p, await repo.tally(p.slug))
    expect(r).toEqual({ winner: b.id, score: '5–2', total: 7, counts: { [a.id]: 2, [b.id]: 5 } })
  })
  test('a tie or no votes has no winner', async () => {
    const [a, b] = [await outfit(['coat']), await outfit(['crew'])]
    const p = await repo.createPoll('u1', [a.id, b.id], '2026-10-27')
    expect(pollResult(p, await repo.tally(p.slug)).winner).toBeNull()
  })
  test('voterKey hashes the cookie id with the ip', () => {
    expect(voterKey('c', '1.2.3.4')).toMatch(/^[0-9a-f]{64}$/)
    expect(voterKey('c', '1.2.3.4')).not.toBe(voterKey('c', '5.6.7.8'))
  })
})

describe('pollWinner rule', () => {
  const poll = { garmentIds: ['coat', 'crew', 'trousers', 'boots'], score: '5–2' }
  test('scores +0.5 for the winning look and explains it', () => {
    const c = { ...ctx(), poll }
    expect(pollWinner.score!(cand('coat', 'crew', 'trousers', 'boots'), c)).toBe(0.5)
    expect(pollWinner.score!(cand('jeans', 'sneakers', 'oxford'), c)).toBe(0)
    expect(pollWinner.note(cand('coat', 'crew', 'trousers', 'boots'), c)).toBe('Friends picked this, 5–2')
  })
  test('is soft: it never rejects', () => expect(pollWinner.kind).toBe('soft'))
})
