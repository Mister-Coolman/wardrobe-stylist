import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { getModels } from '@/lib/models'
import { StyleProfileSchema } from '@/lib/models/schemas'
import { profileFor } from '@/lib/profile'
import { getStorage, userKey } from '@/lib/storage'

const MAX = 12

/** Stretch: up to 12 screenshots of outfits you like → an editable style profile. */
export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_FEATURE_STYLE !== '1') return new Response('Not found', { status: 404 })
  return withUser(async (u) => {
    const files = (await req.formData()).getAll('images').filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX)
    if (!files.length) return Response.json({ error: 'no_images' }, { status: 400 })
    const storage = getStorage()
    const stamp = Date.now()
    const urls = await Promise.all(files.map(async (f, i) =>
      storage.put(`${userKey(u.userId)}/style/${stamp}-${i}.${f.type === 'image/png' ? 'png' : 'jpg'}`, Buffer.from(await f.arrayBuffer()), f.type || 'image/jpeg')))
    const { stylist } = getModels()
    if (!stylist.styleFromImages) return Response.json({ error: 'unavailable' }, { status: 501 })
    const parsed = StyleProfileSchema.safeParse(await stylist.styleFromImages(urls))
    if (!parsed.success) return Response.json({ error: 'bad_output' }, { status: 502 })
    const repo = await getRepo()
    const styleProfile = { ...parsed.data, sourceImages: urls }
    await repo.upsertProfile({ ...(await profileFor(repo, u.userId)), styleProfile })
    return Response.json({ styleProfile })
  })
}
