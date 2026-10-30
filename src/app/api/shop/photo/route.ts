import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { getModels } from '@/lib/models'
import { cutoutFromPhoto } from '@/lib/scan/pipeline'
import { allowedImageUrl, fetchProductImage } from '@/lib/shop/image'
import { getStorage, userKey } from '@/lib/storage'

export const maxDuration = 60

const Body = z.object({ garmentId: z.string(), imageUrl: z.string().refine(allowedImageUrl) })

/** Replace a piece's photo with a listing's: cut out and saved at once. */
export async function POST(req: Request) {
  return withUser(async (u) => {
    const body = Body.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request' }, { status: 400 })
    const repo = await getRepo()
    const garment = (await repo.listGarments(u.userId)).find((g) => g.id === body.data.garmentId)
    if (!garment) return Response.json({ error: 'not_found' }, { status: 404 })
    const storage = getStorage()
    const image = await fetchProductImage(body.data.imageUrl, storage).catch(() => null)
    if (!image) return Response.json({ error: 'image_failed' }, { status: 502 })
    const photoUrl = await storage.put(`${userKey(u.userId)}/shop/${randomUUID()}.jpg`, image, 'image/jpeg')
    const cutoutUrl = await cutoutFromPhoto(photoUrl, { userId: u.userId, models: getModels(), storage })
    if (!cutoutUrl) return Response.json({ error: 'no_piece' }, { status: 422 })
    await repo.updateGarment(u.userId, garment.id, { cutoutUrl, photoUrl })
    return Response.json({ cutoutUrl, photoUrl })
  })
}
