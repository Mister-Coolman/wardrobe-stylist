import { createHmac } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'
import { getModels } from '@/lib/models'
import { defaultProfile } from '@/lib/profile'
import { createMemoryStorage } from '@/lib/storage'
import { handleInbound, parseInbound, sendReply, verifySignature } from '@/lib/whatsapp/api'

const SECRET = 'app-secret'
const sign = (body: string) => `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`
const inbound = (msg: object) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { messages: [{ from: '15550100', id: `wamid.${Math.random()}`, timestamp: '1', ...msg }] } }] }] })

let repo: Repo
let sent: { to: string; type: string; body: Record<string, unknown> }[]
let reads: Record<string, unknown>[]
let readFails = false
beforeEach(async () => {
  vi.stubEnv('WEATHER', 'fixture')
  vi.stubEnv('WHATSAPP_TOKEN', 't'); vi.stubEnv('WHATSAPP_PHONE_ID', 'p')
  repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'wa-')), 'db.json'))
  sent = []; reads = []; readFails = false
  let n = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/p/messages')) {
      const body = JSON.parse(String(init?.body))
      if (body.status === 'read') { reads.push(body); return readFails ? new Response('nope', { status: 500 }) : Response.json({ success: true }) }
      sent.push({ to: body.to, type: body.type, body })
      return Response.json({ messages: [{ id: `wamid.out${n++}` }] })
    }
    return new Response('not found', { status: 404 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const deps = () => ({ repo, models: getModels(), storage: createMemoryStorage() })
const linkU1 = async () => {
  await repo.upsertProfile({ ...defaultProfile('u1'), whatsappId: '15550100', renderMode: 'none' })
  await repo.insertGarments(sampleCloset('u1').map((g) => ({ ...g, confirmed: true })))
}

describe('signature', () => {
  test('a good signature passes; a bad or missing one fails', () => {
    const body = '{"a":1}'
    expect(verifySignature(body, sign(body), SECRET)).toBe(true)
    expect(verifySignature(body, sign('{"a":2}'), SECRET)).toBe(false)
    expect(verifySignature(body, null, SECRET)).toBe(false)
    expect(verifySignature(body, 'sha256=zz', SECRET)).toBe(false)
  })
})

describe('parseInbound', () => {
  test('text, an image with a caption, a button reply and a swipe-reply context', () => {
    const body = { entry: [{ changes: [{ value: { messages: [
      { from: 'a', id: 'm1', type: 'text', text: { body: 'hi' }, context: { id: 'wamid.out1' } },
      { from: 'a', id: 'm2', type: 'image', image: { id: 'media1', caption: 'match this look' } },
      { from: 'a', id: 'm3', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'another', title: 'Another look' } } },
      { from: 'a', id: 'm4', type: 'button', button: { text: 'See the look' } },
    ] } }] }] }
    expect(parseInbound(body)).toEqual([
      { waId: 'a', messageId: 'm1', text: 'hi', contextId: 'wamid.out1' },
      { waId: 'a', messageId: 'm2', text: 'match this look', mediaId: 'media1' },
      { waId: 'a', messageId: 'm3', text: 'Another look' },
      { waId: 'a', messageId: 'm4', text: 'See the look' },
    ])
    expect(parseInbound({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] })).toEqual([])
  })
})

describe('handleInbound', () => {
  test('a linked number gets the stylist’s reply: text, the look as an image is skipped without a signed url, and the 3 buttons', async () => {
    await linkU1()
    await handleInbound(inbound({ type: 'text', text: { body: 'what should I wear' } }), deps())
    const msgs = await repo.listMessages('u1')
    expect(msgs.map((m) => [m.role, m.channel])).toEqual([['user', 'whatsapp'], ['assistant', 'whatsapp']])
    expect(sent[0]).toMatchObject({ to: '15550100', type: 'text' })
    const buttons = sent.find((s) => s.type === 'interactive')!
    expect((buttons.body.interactive as { action: { buttons: { reply: { title: string } }[] } }).action.buttons.map((b) => b.reply.title)).toEqual(['Another look', 'Swap a piece', 'Wore it'])
    expect(msgs[1].waIds.length).toBeGreaterThan(0)
  })

  test('each message gets blue ticks and the typing dots straight away', async () => {
    await linkU1()
    await handleInbound(inbound({ id: 'wamid.tick', type: 'text', text: { body: 'what should I wear' } }), deps())
    expect(reads).toEqual([{ messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.tick', typing_indicator: { type: 'text' } }])
  })

  test('a failed read receipt still gets a reply', async () => {
    await linkU1()
    readFails = true
    await handleInbound(inbound({ type: 'text', text: { body: 'what should I wear' } }), deps())
    expect(sent.some((s) => s.type === 'interactive')).toBe(true)
  })

  test('the same message id twice is handled once', async () => {
    await linkU1()
    const body = inbound({ id: 'wamid.same', type: 'text', text: { body: 'what should I wear' } })
    await handleInbound(body, deps())
    await handleInbound(body, deps())
    expect(await repo.listMessages('u1')).toHaveLength(2)
  })

  test('a reply to a sent look reaches the thread as a reply to that message', async () => {
    await linkU1()
    await handleInbound(inbound({ type: 'text', text: { body: 'what should I wear' } }), deps())
    const look = (await repo.listMessages('u1'))[1]
    await handleInbound(inbound({ type: 'text', text: { body: 'hm' }, context: { id: look.waIds[0] } }), deps())
    expect((await repo.listMessages('u1'))[2].replyTo).toBe(look.id)
  })

  test('a number reply after listings becomes "Add N"', async () => {
    await linkU1()
    await handleInbound(inbound({ type: 'text', text: { body: 'add my black under armour sweatpants' } }), deps())
    expect(sent.some((s) => s.type === 'text' && /1\. .*Under Armour/.test(JSON.stringify(s.body)))).toBe(true)
    await handleInbound(inbound({ type: 'text', text: { body: '9' } }), deps())
    expect((await repo.listMessages('u1')).at(-2)?.text).toBe('Add 9')
  })

  test('an unlinked number gets the link prompt; a link code links it', async () => {
    await repo.upsertProfile({ ...defaultProfile('u2'), whatsappLinkCode: '123456', whatsappLinkExpires: new Date(Date.now() + 60_000).toISOString() })
    await handleInbound(inbound({ from: '15559999', type: 'text', text: { body: 'hello' } }), deps())
    expect(JSON.stringify(sent.at(-1)!.body)).toContain('Link me from Settings in the app first.')
    await handleInbound(inbound({ from: '15559999', type: 'text', text: { body: '123456' } }), deps())
    expect((await repo.profileByWhatsapp('15559999'))?.userId).toBe('u2')
    expect((await repo.getProfile('u2'))?.whatsappLinkCode).toBeNull()
    expect(JSON.stringify(sent.at(-1)!.body)).toContain('Linked')
  })
})

describe('sendReply', () => {
  const pending = (text: string) => ({ id: 'm', userId: 'u1', role: 'assistant' as const, text, imageUrl: null, channel: 'whatsapp' as const, replyTo: null, waIds: [], createdAt: '',
    cards: [{ kind: 'pieces' as const, pending: true, pieces: [{ id: 'g1', name: 'Navy polo', cutoutUrl: '', status: 'clean' as const }] }] })
  test('pieces found in a photo are said once: the reply, or the line when there is no reply', async () => {
    await sendReply('1555', pending('Found a navy polo. Add it?'), createMemoryStorage())
    expect(sent.map((s) => (s.body.text as { body: string }).body)).toEqual(['Found a navy polo. Add it?'])
    sent = []
    await sendReply('1555', pending(''), createMemoryStorage())
    expect(sent.map((s) => (s.body.text as { body: string }).body)).toEqual(['Found: Navy polo. Reply “yes” to add them.'])
  })

  test('listings become a numbered list', async () => {
    const ids = await sendReply('1555', { id: 'm', userId: 'u1', role: 'assistant', text: 'Found 2.', imageUrl: null, channel: 'whatsapp', replyTo: null, waIds: [], createdAt: '',
      cards: [{ kind: 'listings', products: [
        { id: '1', title: 'UA Rival Joggers', store: 'Under Armour', price: '$55.00', url: 'u', imageUrl: 'i' },
        { id: '2', title: 'Deck Polo', store: 'Nautica', url: 'u', imageUrl: 'i' },
      ] }] }, createMemoryStorage())
    expect(ids.length).toBe(2)
    expect((sent[1].body.text as { body: string }).body).toBe('1. UA Rival Joggers — Under Armour, $55.00\n2. Deck Polo — Nautica\nReply with a number to add it.')
  })
})

describe('route', () => {
  test('GET answers the verify challenge only with the right token; POST refuses a bad signature', async () => {
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'v'); vi.stubEnv('WHATSAPP_APP_SECRET', SECRET)
    const { GET, POST } = await import('@/app/api/whatsapp/route')
    expect(await (await GET(new Request('http://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=v&hub.challenge=42'))).text()).toBe('42')
    expect((await GET(new Request('http://x/api/whatsapp?hub.mode=subscribe&hub.verify_token=no&hub.challenge=42'))).status).toBe(403)
    expect((await POST(new Request('http://x/api/whatsapp', { method: 'POST', body: '{}', headers: { 'x-hub-signature-256': 'sha256=bad' } }))).status).toBe(401)
  })
})
