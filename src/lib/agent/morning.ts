import 'server-only'
import type { Repo } from '@/lib/db/repo'
import { localDate } from '@/lib/domain/dates'
import type { Message, Profile } from '@/lib/domain/types'
import { RAIN_THRESHOLD } from '@/lib/rules/weather'
import { planToday } from '@/lib/today'
import { outfitCard } from './tools'

export const MIN_PIECES = 3

/** The day's look, sent once a day before the owner asks: a thread message, and a WhatsApp message when linked (`send`).
 *  The cron has no Google sign-in, so only events added in the app count. Null when skipped. */
export async function morningNote(repo: Repo, profile: Profile, deps: { send?: (p: Profile, m: Message) => Promise<void> }): Promise<Message | null> {
  const userId = profile.userId
  const pieces = await repo.listGarments(userId, { confirmed: true })
  if (pieces.length < MIN_PIECES) return null
  const today = localDate(profile.tz)
  const recent = await repo.listMessages(userId, { limit: 50 })
  if (recent.some((m) => m.channel === 'system' && localDate(profile.tz, new Date(m.createdAt)) === today)) return null

  const plan = await planToday(repo, { userId, email: '', googleAccessToken: null }, { date: today })
  let text: string
  const cards: Message['cards'] = []
  if (!plan.result.ok) {
    text = `Morning. No clean ${plan.result.missing.join(' or ')} today — wash day?`
  } else {
    const { outfit, pieces: worn } = plan.result
    const w = plan.day.weather
    const dressy = plan.day.events.find((e) => (e.formality ?? 0) >= 4)
    const laundry = pieces.filter((g) => g.status === 'laundry').length
    const rainSafe = worn.find((g) => g.rainSafe && (g.category === 'outerwear' || g.category === 'shoes'))
    const extra =
      w.rainProbability >= RAIN_THRESHOLD ? `${w.summary}${rainSafe ? ` — the ${rainSafe.name.toLowerCase()} handles it.` : '.'}` :
      dressy ? `Dressed up for ${dressy.title}.` :
      laundry > 3 ? `${laundry} pieces in the laundry.` : ''
    text = `Morning. ${outfit.title}: ${worn.map((g) => g.name).join(', ')}.${extra ? ` ${extra}` : ''}`
    cards.push(outfitCard(outfit, worn))
  }
  const m = await repo.addMessage({ userId, role: 'assistant', text, cards, imageUrl: null, channel: 'system', replyTo: null, waIds: [] })
  await deps.send?.(profile, m).catch((e) => console.error('morning send failed', e))
  return m
}
