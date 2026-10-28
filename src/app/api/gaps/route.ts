import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { localDate } from '@/lib/domain/dates'
import { getModels } from '@/lib/models'
import { profileFor } from '@/lib/profile'
import { closetGaps, REPRESENTATIVE_DAYS } from '@/lib/stylist/gap'

export async function GET() {
  return withUser(async (u) => {
    const repo = await getRepo()
    const profile = await profileFor(repo, u.userId)
    const wardrobe = await repo.listGarments(u.userId, { confirmed: true })
    if (wardrobe.length < 3) return Response.json({ gap: null })
    const { stylist } = getModels()
    const gap = await closetGaps({ wardrobe, profile, stylist, days: REPRESENTATIVE_DAYS(localDate(profile.tz)),
      productSearch: async (item) => (stylist.searchProduct ? stylist.searchProduct(item) : null) })
    return Response.json({ gap })
  })
}
