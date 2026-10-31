import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import sharp from 'sharp'
import { runThread, STYLIST_FAILED } from '@/lib/agent/thread'
import type { Repo } from '@/lib/db/repo'
import type { Message, Profile } from '@/lib/domain/types'
import { ModelError } from '@/lib/models/types'
import type { Models } from '@/lib/models/types'
import type { StorageLike } from '@/lib/storage'
import { userKey } from '@/lib/storage'
import { matchLinkCode } from './link'

// WhatsApp Cloud API (Meta Graph). Replies arrive by webhook; we answer through the phone number's /messages endpoint.
const GRAPH = 'https://graph.facebook.com/v21.0'
export const LINK_FIRST = 'Link me from Settings in the app first.'
export const LINKED = 'Linked — text me anytime.'
/** Within this long of the owner's last WhatsApp message we may write freely; after it, only an approved template */
const WINDOW_MS = 24 * 60 * 60_000
const BUTTONS = ['Another look', 'Swap a piece', 'Wore it'] as const

/** Meta signs each webhook body with the app secret (X-Hub-Signature-256: sha256=<hex>). */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false
  const want = createHmac('sha256', secret).update(rawBody).digest()
  const got = Buffer.from(header.slice(7), 'hex')
  return got.length === want.length && timingSafeEqual(got, want)
}

export interface Inbound { waId: string; messageId: string; text?: string; mediaId?: string; contextId?: string }

interface WaMessage {
  from: string; id: string; type: string; context?: { id?: string }
  text?: { body?: string }; image?: { id?: string; caption?: string }
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; button?: { text?: string }
}

/** The messages in a webhook body (status updates carry none). A tapped button arrives as its title, like typed text. */
export function parseInbound(body: unknown): Inbound[] {
  const entries = (body as { entry?: { changes?: { value?: { messages?: WaMessage[] } }[] }[] })?.entry ?? []
  return entries.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []).map((m) => {
    const text = m.text?.body ?? m.image?.caption ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.button?.text
    return { waId: m.from, messageId: m.id, ...(text ? { text } : {}), ...(m.image?.id ? { mediaId: m.image.id } : {}), ...(m.context?.id ? { contextId: m.context.id } : {}) }
  })
}

async function graph(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, ...init.headers }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`whatsapp ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res
}

/** One outgoing message; returns its WhatsApp id. */
async function send(to: string, payload: Record<string, unknown>): Promise<string> {
  const res = await graph(`/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to, ...payload }),
  })
  return ((await res.json()) as { messages?: { id: string }[] }).messages?.[0]?.id ?? ''
}
const sendText = (to: string, body: string) => send(to, { type: 'text', text: { body } })

/** Blue ticks on the owner's message, and typing dots until our reply lands (Meta drops them after 25 s). Never blocks the reply. */
const markRead = (messageId: string) => graph(`/${process.env.WHATSAPP_PHONE_ID}/messages`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' } }),
}).catch((e) => console.error('whatsapp read receipt failed', e))

/** A photo the owner sent: Graph gives a short-lived url, fetched with the same token. */
export async function downloadMedia(mediaId: string): Promise<Buffer> {
  const { url } = (await (await graph(`/${mediaId}`)).json()) as { url: string }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`whatsapp media → ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** A stylist message as WhatsApp messages: its text, each look as an image with reply buttons, listings as a numbered list.
 *  Returns the ids of everything sent, so a swipe-reply on any of them finds this message. */
export async function sendReply(to: string, m: Message, storage: StorageLike): Promise<string[]> {
  const ids: string[] = []
  if (m.text) ids.push(await sendText(to, m.text))
  for (const c of m.cards) {
    if (c.kind === 'outfit') {
      const names = c.pieces.map((p) => p.name).join(', ')
      const link = c.imageUrl?.startsWith('/api/media/') ? await storage.signedUrl?.(c.imageUrl, 3600).catch(() => null) : null
      if (link) ids.push(await send(to, { type: 'image', image: { link, caption: names } }))
      ids.push(await send(to, { type: 'interactive', interactive: {
        type: 'button', body: { text: link ? 'What next?' : names },
        action: { buttons: BUTTONS.map((title, i) => ({ type: 'reply', reply: { id: `b${i}`, title } })) },
      } }))
    } else if (c.kind === 'listings') {
      const lines = c.products.map((p, i) => `${i + 1}. ${p.title} — ${[p.store, p.price].filter(Boolean).join(', ')}`)
      ids.push(await sendText(to, `${lines.join('\n')}\nReply with a number to add it.`))
    } else if (c.kind === 'trip') {
      ids.push(await sendText(to, `${c.destination}, ${c.days} days — the packing list is in the app under Trips.`))
    } else if (c.kind === 'pieces' && c.pending && !m.text) {
      ids.push(await sendText(to, `Found: ${c.pieces.map((p) => p.name).join(', ')}. Reply “yes” to add them.`))
    }
  }
  return ids.filter(Boolean)
}

/** Outside the 24-hour window only an approved template may go first: `morning_look`, or Meta's built-in `hello_world`. */
export async function sendTemplate(to: string, name: string, bodyParams: string[]): Promise<string> {
  return send(to, { type: 'template', template: { name, language: { code: 'en_US' },
    ...(bodyParams.length ? { components: [{ type: 'body', parameters: bodyParams.map((text) => ({ type: 'text', text })) }] } : {}) } })
}

/** The morning note on WhatsApp for a linked owner: free text inside the window, else the template. */
export function morningSender(repo: Repo, storage: StorageLike) {
  return async (p: Profile, m: Message) => {
    if (!p.whatsappId || !process.env.WHATSAPP_TOKEN) return
    const lastIn = (await repo.listMessages(p.userId, { limit: 50 })).filter((x) => x.role === 'user' && x.channel === 'whatsapp').at(-1)
    const open = lastIn && Date.now() - new Date(lastIn.createdAt).getTime() < WINDOW_MS
    const template = process.env.WHATSAPP_TEMPLATE || 'morning_look'
    const ids = open ? await sendReply(p.whatsappId, m, storage) : [await sendTemplate(p.whatsappId, template, template === 'hello_world' ? [] : [m.text])]
    await repo.addWaIds(p.userId, m.id, ids.filter(Boolean))
  }
}

/** Message ids already handled by this server; Meta retries deliveries it thinks failed */
const seen = new Set<string>()
const remember = (id: string) => { seen.add(id); if (seen.size > 500) seen.delete(seen.values().next().value!) }

/** Everything a webhook delivery asks for: link codes, the link prompt, or a turn of the thread answered on WhatsApp. */
export async function handleInbound(body: unknown, deps: { repo: Repo; models: Models; storage: StorageLike }): Promise<void> {
  const { repo, storage } = deps
  for (const msg of parseInbound(body)) {
    if (seen.has(msg.messageId)) continue
    remember(msg.messageId)
    await markRead(msg.messageId)
    try {
      const text = msg.text?.trim() ?? ''
      const linking = matchLinkCode(await repo.listProfiles(), text)
      if (linking) {
        await repo.upsertProfile({ ...linking, whatsappId: msg.waId, whatsappLinkCode: null, whatsappLinkExpires: null })
        await sendText(msg.waId, LINKED)
        continue
      }
      const profile = await repo.profileByWhatsapp(msg.waId)
      if (!profile) { await sendText(msg.waId, LINK_FIRST); continue }
      const userId = profile.userId
      if (await repo.messageByWaId(userId, msg.messageId)) continue

      let imageUrl: string | undefined
      if (msg.mediaId) {
        const jpeg = await sharp(await downloadMedia(msg.mediaId)).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
        imageUrl = await storage.put(`${userKey(userId)}/thread/${randomUUID()}.jpg`, jpeg, 'image/jpeg')
      }
      // "2" after a list of listings means "add the second one"
      const recent = /^\d{1,2}$/.test(text) ? await repo.listMessages(userId, { limit: 10 }) : []
      const afterListings = recent.some((m) => m.cards.some((c) => c.kind === 'listings'))
      const quoted = msg.contextId ? await repo.messageByWaId(userId, msg.contextId) : null
      const { reply } = await runThread({ userId, email: '', googleAccessToken: null },
        { text: afterListings ? `Add ${text}` : text, imageUrl, channel: 'whatsapp', replyTo: quoted?.id ?? null, waId: msg.messageId },
        { repo, models: deps.models })
      await repo.addWaIds(userId, reply.id, await sendReply(msg.waId, reply, storage))
    } catch (e) {
      console.error('whatsapp inbound failed', e)
      if (e instanceof ModelError) await sendText(msg.waId, STYLIST_FAILED).catch(() => {})
    }
  }
}
