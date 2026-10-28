import { createHash } from 'node:crypto'
import type { Poll } from '@/lib/domain/types'

export const pollsEnabled = () => process.env.NEXT_PUBLIC_FEATURE_POLL === '1'

/** One vote per browser + network: sha256(cookie id + ip). */
export function voterKey(cookieId: string, ip: string): string {
  return createHash('sha256').update(`${cookieId}|${ip}`).digest('hex')
}

export function pollResult(poll: Poll, tally: Record<string, number>) {
  const counts = Object.fromEntries(poll.outfitIds.map((id) => [id, tally[id] ?? 0]))
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const total = sorted.reduce((s, [, n]) => s + n, 0)
  const winner = total && sorted[0][1] > (sorted[1]?.[1] ?? 0) ? sorted[0][0] : null
  return { winner, score: sorted.map(([, n]) => n).join('–'), total, counts }
}
