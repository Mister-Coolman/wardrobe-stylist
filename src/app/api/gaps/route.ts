import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { localDate } from '@/lib/domain/dates'
import { getModels } from '@/lib/models'
import { profileFor } from '@/lib/profile'
import { closetGaps, REPRESENTATIVE_DAYS } from '@/lib/stylist/gap'
import type { Gap } from '@/lib/stylist/gap'

// one model + web-search call per user per day per closet, not per page load
const cache = new Map<string, Gap | null>()

export async function GET() {
  return withUser(async (u) => {
    const repo = await getRepo()
    const profile = await profileFor(repo, u.userId)
    const wardrobe = await repo.listGarments(u.userId, { confirmed: true })
    if (wardrobe.length < 3) return Response.json({ gap: null })
    const date = localDate(profile.tz)
    const key = [u.userId, date, wardrobe.map((g) => `${g.id}:${g.status}`).sort().join(',')].join('|')
    if (cache.has(key)) return Response.json({ gap: cache.get(key) })
    const { stylist } = getModels()
    const gap = await closetGaps({ wardrobe, profile, stylist, days: REPRESENTATIVE_DAYS(date),
      productSearch: async (item) => (stylist.searchProduct ? stylist.searchProduct(item) : null) })
    if (cache.size > 500) cache.clear()
    cache.set(key, gap)
    return Response.json({ gap })
  })
}
