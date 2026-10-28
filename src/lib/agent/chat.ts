import 'server-only'
import type { ChatMessage, Models } from '@/lib/models/types'
import type { Repo } from '@/lib/db/repo'
import type { SessionUser } from '@/lib/session'
import { dispatchTool, toolSpecs } from './tools'
import type { ToolContext } from './tools'

export { toolSpecs }
export const MAX_TOOL_ROUNDS = 5
export const TOO_MANY_ROUNDS = 'I couldn’t finish that — try asking more simply.'

const SYSTEM = `You are a personal stylist inside a wardrobe app. Be brief, specific and a little dry — like a friend who's good with clothes.
Never choose garments yourself: to suggest an outfit call plan_outfit; for travel call plan_trip. If the user mentions something they're doing today that may not be on their calendar, call add_event first, then plan_outfit.
Never mention being an AI. Reply in one or two sentences.`

export async function runChat(user: SessionUser, messages: ChatMessage[], deps: {
  repo: Repo; models: Models; geocode?: ToolContext['geocode']
}): Promise<{ reply: string; outfitId?: string; tripId?: string }> {
  const ctx: ToolContext = { user, repo: deps.repo, models: deps.models, geocode: deps.geocode }
  const convo: ChatMessage[] = [{ role: 'system', content: SYSTEM }, ...messages.filter((m) => m.role !== 'system')]
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await deps.models.chat.complete(convo, toolSpecs)
    if (!turn.toolCalls.length) return { reply: turn.content?.trim() || 'Done.', outfitId: ctx.outfitId, tripId: ctx.tripId }
    convo.push({ role: 'assistant', content: turn.content, toolCalls: turn.toolCalls })
    for (const call of turn.toolCalls) {
      const result = await dispatchTool(call.name, call.arguments, ctx).catch((e: unknown) => ({ error: e instanceof Error ? e.message : 'tool failed' }))
      convo.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result) })
    }
  }
  return { reply: TOO_MANY_ROUNDS, outfitId: ctx.outfitId, tripId: ctx.tripId }
}
