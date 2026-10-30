import 'server-only'
import type { ChatMessage, Models } from '@/lib/models/types'
import type { Repo } from '@/lib/db/repo'
import type { SessionUser } from '@/lib/session'
import { runThread } from './thread'
import type { ToolContext } from './tools'

/** The chat sheet's route until the Stylist tab replaces it: the newest message goes through the saved thread. */
export async function runChat(user: SessionUser, messages: ChatMessage[], deps: {
  repo: Repo; models: Models; geocode?: ToolContext['geocode']
}): Promise<{ reply: string; outfitId?: string; tripId?: string }> {
  const last = messages.at(-1)
  const { reply } = await runThread(user, { text: last?.role === 'user' ? last.content : '', channel: 'web' }, deps)
  const outfit = reply.cards.find((c) => c.kind === 'outfit')
  const trip = reply.cards.find((c) => c.kind === 'trip')
  return { reply: reply.text, outfitId: outfit?.kind === 'outfit' ? outfit.outfitId : undefined, tripId: trip?.kind === 'trip' ? trip.tripId : undefined }
}
