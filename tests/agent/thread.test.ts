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

describe('scripted conversations (mock chat)', () => {
  const say = (text: string, extra: object = {}) => runThread(user, web(text, extra), { repo, models: getModels() })

  test('"swap the jeans" swaps a piece in the look in view; a swipe-reply targets the quoted look', async () => {
    const { reply: a } = await say('what should I wear')
    const first = a.cards[0]
    if (first.kind !== 'outfit') throw new Error('no look')
    const bottom = first.pieces.find((p) => /jeans|trousers|sweatpants/i.test(p.name))!
    const word = bottom.name.toLowerCase().split(' ').at(-1)!
    await say('another look')
    const { reply: b } = await say(`swap the ${word}`, { replyTo: a.id })
    const swapped = b.cards[0]
    if (swapped.kind !== 'outfit') throw new Error(`no swap: ${b.text}`)
    expect(swapped.pieces.map((p) => p.id)).not.toContain(bottom.id)
    for (const p of first.pieces) if (p.id !== bottom.id) expect(swapped.pieces.map((x) => x.id)).toContain(p.id)
  })

  test('"I spilled coffee on the white oxford" puts it in the laundry', async () => {
    const { reply } = await say('I spilled coffee on the white oxford')
    expect(reply.cards[0]).toMatchObject({ kind: 'pieces', pieces: [{ name: 'White oxford shirt', status: 'laundry' }] })
  })

  test('delete asks first; "yes, delete" removes it', async () => {
    const { reply } = await say('delete the selvedge jeans')
    expect(reply.text).toMatch(/yes, delete/)
    expect((await repo.listGarments('u1')).some((g) => g.name === 'Selvedge jeans')).toBe(true)
    await say('yes, delete')
    expect((await repo.listGarments('u1')).some((g) => g.name === 'Selvedge jeans')).toBe(false)
  })

  test('a store search, then "add 1" from it', async () => {
    vi.stubEnv('MEDIA_DIR', mkdtempSync(join(tmpdir(), 'media-')))
    const { reply } = await say('add my black under armour sweatpants')
    expect(reply.cards[0].kind).toBe('listings')
    const { reply: added } = await say('add 1')
    expect(added.cards[0].kind).toBe('added')
    expect((await repo.listGarments('u1', { confirmed: true })).some((g) => g.brand === 'Under Armour')).toBe(true)
  })

  test('"in general I like navy with olive" is remembered and listed to the model; "forget the navy thing" removes it', async () => {
    const { reply } = await say('in general I like navy with olive')
    expect(reply.text).toMatch(/Noted/)
    const { chat, seen } = capturing()
    await runThread(user, web('forget the navy thing'), { repo, models: { ...getModels(), chat } })
    expect(seen[0][0].content).toMatch(/- \(\S+\) in general I like navy with olive/)
    expect((await repo.getProfile('u1'))?.stylistNotes).toEqual([])
  })

  test('an Instagram link gets asked for a screenshot, with no tool call', async () => {
    const { reply } = await say('make something like this https://www.instagram.com/reel/abc123/')
    expect(reply.text).toBe('Send me a screenshot of the moment you liked.')
    expect(reply.cards).toEqual([])
  })
})

describe('clean', () => {
  test('bracketed lines the model echoes become plain words', async () => {
    const { clean } = await import('@/lib/agent/thread')
    expect(clean('Pulled your match with [outfit 55cd for 2026-10-30: Tailored] — oxford + oat knit.')).toBe('Pulled your match with this look — oxford + oat knit.')
    expect(clean('Found these [found in the photo, not added yet — keep_pieces with these ids: Tee (g1)] want them?')).toBe('Found these want them?')
  })
})
