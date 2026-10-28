import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { runChat, TOO_MANY_ROUNDS, toolSpecs } from '@/lib/agent/chat'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import { localDate } from '@/lib/domain/dates'
import { getModels } from '@/lib/models'
import type { ChatModel } from '@/lib/models'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'

const user = { userId: 'u1', email: 'u1', googleAccessToken: null }
let repo: Repo
beforeEach(async () => {
  vi.stubEnv('WEATHER', 'fixture')
  repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'chat-')), 'db.json'))
  await repo.insertGarments(sampleCloset('u1'))
})

describe('runChat', () => {
  test('exposes the seven tools', () => {
    expect(toolSpecs.map((t) => t.name).sort()).toEqual(['add_event', 'get_events', 'get_weather', 'log_wear', 'plan_outfit', 'plan_trip', 'search_wardrobe'])
  })

  test('"drinks after work" adds a user event and plans an outfit through the loop', async () => {
    const r = await runChat(user, [{ role: 'user', content: 'drinks after work' }], { repo, models: getModels() })
    expect(r.outfitId).toBeTruthy()
    expect(r.reply.length).toBeGreaterThan(0)
    const date = localDate('America/New_York')
    const events = await repo.listUserEvents('u1', date)
    expect(events.map((e) => [e.title, e.source])).toEqual([['drinks after work', 'user']])
    const outfit = await repo.getOutfit('u1', r.outfitId!)
    expect(outfit?.contextDate).toBe(date)
  })

  test('a tool loop past 5 rounds stops with an apology', async () => {
    let n = 0
    const chat: ChatModel = { complete: async () => ({ content: null, toolCalls: [{ id: `c${n++}`, name: 'search_wardrobe', arguments: '{}' }] }) }
    const r = await runChat(user, [{ role: 'user', content: 'hm' }], { repo, models: { ...getModels(), chat } })
    expect(r.reply).toBe(TOO_MANY_ROUNDS)
    expect(TOO_MANY_ROUNDS).toBe('I couldn’t finish that — try asking more simply.')
    expect(n).toBe(5)
  })

  test('unknown tools and bad arguments come back as tool errors, not crashes', async () => {
    let n = 0
    const chat: ChatModel = { complete: async (msgs) => {
      if (n++ === 0) return { content: null, toolCalls: [{ id: 'a', name: 'nope', arguments: '{' }, { id: 'b', name: 'log_wear', arguments: '{"outfitId":"missing"}' }] }
      const tools = msgs.filter((m) => m.role === 'tool').map((m) => m.content)
      return { content: tools.join(' | '), toolCalls: [] }
    } }
    const r = await runChat(user, [{ role: 'user', content: 'x' }], { repo, models: { ...getModels(), chat } })
    expect(r.reply).toMatch(/error/)
  })

  test('plan_trip saves a trip and returns its id', async () => {
    const r = await runChat(user, [{ role: 'user', content: 'pack for Chicago' }], { repo, models: getModels(), geocode: async () => ({ lat: 41.88, lon: -87.63, name: 'Chicago' }) })
    expect(r.tripId).toBeTruthy()
    expect((await repo.getTrip('u1', r.tripId!))?.dayPlans).toHaveLength(3)
  })
})
