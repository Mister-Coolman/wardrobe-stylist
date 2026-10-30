import 'server-only'
import type { Repo } from '@/lib/db/repo'
import type { Card, Message } from '@/lib/domain/types'
import type { ChatMessage, Models } from '@/lib/models/types'
import { profileFor } from '@/lib/profile'
import type { SessionUser } from '@/lib/session'
import { dispatchTool, toolSpecs } from './tools'
import type { ToolContext } from './tools'

export { toolSpecs }
export const MAX_TOOL_ROUNDS = 5
export const HISTORY = 20
export const TOO_MANY_ROUNDS = 'I couldn’t finish that — try asking more simply.'
export const STYLIST_FAILED = 'Couldn’t reach your stylist. Try again.'

const SYSTEM = `You are a personal stylist the owner texts, inside their wardrobe app. Be warm, specific and a little dry — like a friend who's good with clothes.
Reply in 2–4 sentences: say what you did and why. Ask one short question only when something is genuinely open.
Never choose garments yourself: outfits come only from your tools (plan_outfit and the others that plan looks), which check the weather, dress code and laundry.
If the owner mentions something they're doing that may not be on their calendar, call add_event first, then plan the look.
Earlier looks, listings, pieces and trips appear as bracketed lines like [outfit <id> for <date>: …]; use those ids. A message starting "(Replying to: …)" is about that exact item.
When the owner states a standing preference (colours they like together, a pairing, "I run warm"), save it with remember; pass pieceIds when it names pieces.
Never mention being an AI.`


/** One line the model can refer back to ("swap the jeans" → this outfit's id). */
export function summariseCard(c: Card): string {
  switch (c.kind) {
    case 'outfit': return `[outfit ${c.outfitId} for ${c.date}: ${c.pieces.map((p) => `${p.name} (${p.id})`).join(', ')}]`
    case 'pieces': return `[pieces: ${c.pieces.map((p) => `${p.name} (${p.status}, ${p.id})`).join(', ')}]`
    case 'listings': return `[listings: ${c.products.map((p, i) => `${i + 1}. ${p.title} (${[p.store, p.price].filter(Boolean).join(', ')})`).join('; ')}]`
    case 'trip': return `[trip ${c.tripId}: ${c.destination}, ${c.days} days]`
    case 'added': return `[added to the closet: ${c.garmentIds.join(', ')}]`
  }
}

const spelled = (m: Message) => [m.text, ...m.cards.map(summariseCard)].filter(Boolean).join('\n')

function toChat(m: Message, newest: boolean): ChatMessage {
  if (m.role === 'assistant') return { role: 'assistant', content: spelled(m) }
  const photo = m.imageUrl && !newest ? '[photo] ' : ''
  return { role: 'user', content: `${photo}${m.text}`, ...(newest && m.imageUrl ? { imageUrl: m.imageUrl } : {}) }
}

/** Save the owner's message, run the stylist over the recent thread, save its reply with the cards its tools made.
 *  A model failure leaves the owner's message saved and rethrows. */
export async function runThread(user: SessionUser, input: { text: string; imageUrl?: string; channel: Message['channel']; replyTo?: string | null; waId?: string }, deps: {
  repo: Repo; models: Models; geocode?: ToolContext['geocode']
}): Promise<{ user: Message; reply: Message }> {
  const { repo } = deps
  const quotedMsg = input.replyTo ? await repo.getMessage(user.userId, input.replyTo) : null
  const saved = await repo.addMessage({ userId: user.userId, role: 'user', text: input.text, cards: [], imageUrl: input.imageUrl ?? null,
    channel: input.channel, replyTo: quotedMsg?.id ?? null, waIds: input.waId ? [input.waId] : [] })

  const recent = await repo.listMessages(user.userId, { limit: HISTORY })
  const listingsFrom = (ms: Message[]) => ms.flatMap((m) => m.cards).filter((c) => c.kind === 'listings').at(-1)
  const listings = (quotedMsg && listingsFrom([quotedMsg])) || listingsFrom(recent)
  const ctx: ToolContext = { user, repo, models: deps.models, geocode: deps.geocode, cards: [], channel: input.channel,
    imageUrl: input.imageUrl ?? quotedMsg?.imageUrl ?? undefined, lastListings: listings?.kind === 'listings' ? listings.products : undefined }

  const history = recent.map((m) => toChat(m, m.id === saved.id))
  const last = history.at(-1)
  if (quotedMsg && last?.role === 'user') last.quoted = spelled(quotedMsg)
  const notes = (await profileFor(repo, user.userId)).stylistNotes ?? []
  const known = notes.length ? `\nWhat the owner has told you to remember (forget by id):\n${notes.map((n) => `- (${n.id}) ${n.text}`).join('\n')}` : ''
  const convo: ChatMessage[] = [{ role: 'system', content: SYSTEM + known }, ...history]

  let text = TOO_MANY_ROUNDS
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await deps.models.chat.complete(convo, toolSpecs)
    if (!turn.toolCalls.length) { text = turn.content?.trim() || 'Done.'; break }
    convo.push({ role: 'assistant', content: turn.content, toolCalls: turn.toolCalls })
    for (const call of turn.toolCalls) {
      const result = await dispatchTool(call.name, call.arguments, ctx).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'tool failed' }))
      convo.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result) })
    }
  }
  const reply = await repo.addMessage({ userId: user.userId, role: 'assistant', text, cards: ctx.cards, imageUrl: null,
    channel: input.channel === 'whatsapp' ? 'whatsapp' : 'web', replyTo: null, waIds: [] })
  return { user: saved, reply }
}
