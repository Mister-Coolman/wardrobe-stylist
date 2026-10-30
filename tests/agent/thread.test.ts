import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { runThread, summariseCard, TOO_MANY_ROUNDS, toolSpecs } from '@/lib/agent/thread'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import { localDate } from '@/lib/domain/dates'
import { getModels, ModelError } from '@/lib/models'
import type { ChatMessage, ChatModel } from '@/lib/models'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'

const user = { userId: 'u1', email: 'u1', googleAccessToken: null }
const web = (text: string, extra: object = {}) => ({ text, channel: 'web' as const, ...extra })
let repo: Repo
beforeEach(async () => {
  vi.stubEnv('WEATHER', 'fixture')
  repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'thread-')), 'db.json'))
  await repo.insertGarments(sampleCloset('u1'))
})

/** the mock chat, recording what it was shown */
function capturing(): { chat: ChatModel; seen: ChatMessage[][] } {
  const seen: ChatMessage[][] = []
  return { seen, chat: { complete: async (m, t) => { seen.push(structuredClone(m)); return getModels().chat.complete(m, t) } } }
}
const filler = async (n: number) => {
  for (let i = 0; i < n; i++) await repo.addMessage({ userId: 'u1', role: i % 2 ? 'assistant' : 'user', text: `old ${i}`, cards: [], imageUrl: null, channel: 'web', replyTo: null, waIds: [] })
}

describe('runThread', () => {
  test('"drinks after work" saves both messages; the reply carries the outfit card', async () => {
    const { user: u, reply } = await runThread(user, web('drinks after work'), { repo, models: getModels() })
    expect(u.role).toBe('user')
    expect(reply.cards[0]).toMatchObject({ kind: 'outfit', date: localDate('America/New_York') })
    expect(reply.text.length).toBeGreaterThan(0)
    expect((await repo.listMessages('u1')).map((m) => m.role)).toEqual(['user', 'assistant'])
    expect((await repo.listUserEvents('u1', localDate('America/New_York'))).map((e) => e.title)).toEqual(['drinks after work'])
  })

  test('the model sees earlier cards as one line each', async () => {
    const { reply } = await runThread(user, web('what should I wear'), { repo, models: getModels() })
    const card = reply.cards[0]
    const { chat, seen } = capturing()
    await runThread(user, web('hm'), { repo, models: { ...getModels(), chat } })
    const history = seen[0].map((m) => (m.role === 'tool' ? '' : m.content ?? '')).join('\n')
    expect(history).toContain(summariseCard(card))
    expect(summariseCard(card)).toMatch(/^\[outfit [\w-]+ for \d{4}-\d{2}-\d{2}: .+\]$/)
  })

  test('only the last 20 messages go to the model', async () => {
    await filler(30)
    const { chat, seen } = capturing()
    await runThread(user, web('hm'), { repo, models: { ...getModels(), chat } })
    expect(seen[0].filter((m) => m.role !== 'system')).toHaveLength(20)
  })

  test('a reply spells out the quoted message, even one older than the last 20', async () => {
    const { reply: first } = await runThread(user, web('what should I wear'), { repo, models: getModels() })
    await filler(30)
    const { chat, seen } = capturing()
    const { user: u } = await runThread(user, web('hm', { replyTo: first.id }), { repo, models: { ...getModels(), chat } })
    const last = seen[0].at(-1)!
    expect(last.role === 'user' ? last.quoted : '').toContain('[outfit ')
    expect(u.replyTo).toBe(first.id)
  })

  test('a reply to another user’s message id is stored as null', async () => {
    const theirs = await repo.addMessage({ userId: 'someone-else', role: 'assistant', text: 'x', cards: [], imageUrl: null, channel: 'web', replyTo: null, waIds: [] })
    const { user: u } = await runThread(user, web('hm', { replyTo: theirs.id }), { repo, models: getModels() })
    expect(u.replyTo).toBeNull()
  })

  test('a failing tool still gives a reply in plain words and keeps the user message', async () => {
    let n = 0
    const chat: ChatModel = { complete: async (msgs) => n++ === 0
      ? { content: null, toolCalls: [{ id: 'a', name: 'log_wear', arguments: '{"outfitId":"missing"}' }] }
      : { content: `Couldn’t log that: ${msgs.filter((m) => m.role === 'tool').map((m) => m.content).join('')}`, toolCalls: [] } }
    const { reply } = await runThread(user, web('wore it'), { repo, models: { ...getModels(), chat } })
    expect(reply.text).toMatch(/no such outfit/)
    expect(await repo.listMessages('u1')).toHaveLength(2)
  })

  test('a model failure keeps the user message and throws', async () => {
    const chat: ChatModel = { complete: async () => { throw new ModelError('chat', 'timeout', 'slow') } }
    await expect(runThread(user, web('hello'), { repo, models: { ...getModels(), chat } })).rejects.toBeInstanceOf(ModelError)
    expect((await repo.listMessages('u1')).map((m) => m.text)).toEqual(['hello'])
  })

  test('no clean bottoms: the reply explains, with no card', async () => {
    for (const g of await repo.listGarments('u1')) if (g.category === 'bottom') await repo.updateGarment('u1', g.id, { status: 'laundry' })
    const { reply } = await runThread(user, web('what should I wear'), { repo, models: getModels() })
    expect(reply.cards).toEqual([])
    expect(reply.text).toMatch(/no clean bottom/)
  })

  test('a tool loop past 5 rounds stops with an apology', async () => {
    let n = 0
    const chat: ChatModel = { complete: async () => ({ content: null, toolCalls: [{ id: `c${n++}`, name: 'search_wardrobe', arguments: '{}' }] }) }
    const { reply } = await runThread(user, web('hm'), { repo, models: { ...getModels(), chat } })
    expect(reply.text).toBe(TOO_MANY_ROUNDS)
    expect(n).toBe(5)
  })

  test('unknown tools and bad arguments come back as tool errors, not crashes', async () => {
    let n = 0
    const chat: ChatModel = { complete: async (msgs) => n++ === 0
      ? { content: null, toolCalls: [{ id: 'a', name: 'nope', arguments: '{' }, { id: 'b', name: 'log_wear', arguments: '{}' }] }
      : { content: msgs.filter((m) => m.role === 'tool').map((m) => m.content).join(' | '), toolCalls: [] } }
    const { reply } = await runThread(user, web('x'), { repo, models: { ...getModels(), chat } })
    expect(reply.text).toMatch(/unknown tool nope.*bad arguments/)
  })

  test('plan_trip gives a trip card', async () => {
    const { reply } = await runThread(user, web('pack for Chicago'), { repo, models: getModels(), geocode: async () => ({ lat: 41.88, lon: -87.63, name: 'Chicago' }) })
    expect(reply.cards[0]).toMatchObject({ kind: 'trip', destination: 'Chicago', days: 3 })
    expect((await repo.getTrip('u1', (reply.cards[0] as { tripId: string }).tripId))?.dayPlans).toHaveLength(3)
  })

  test('the tools include the original seven', () => {
    expect(toolSpecs.map((t) => t.name)).toEqual(expect.arrayContaining(['add_event', 'get_events', 'get_weather', 'log_wear', 'plan_outfit', 'plan_trip', 'search_wardrobe']))
  })
})
