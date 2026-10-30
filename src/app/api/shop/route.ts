import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { z } from 'zod'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { getModels } from '@/lib/models'
import { ModelError } from '@/lib/models/types'
import { runScan } from '@/lib/scan/pipeline'
import { allowedImageUrl, fetchProductImage } from '@/lib/shop/image'
import { getProductSearch } from '@/lib/shop/search'
import { getStorage, userKey } from '@/lib/storage'

export const maxDuration = 300

/** ?q=black under armour sweatpants → store listings with photos */
export async function GET(req: Request) {
  return withUser(async () => {
    const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 120)
    if (!q) return Response.json({ error: 'bad_request' }, { status: 400 })
    try {
      return Response.json({ products: await getProductSearch().search(q) })
    } catch (e) {
      console.error('product search failed', e)
      return Response.json({ error: e instanceof ModelError && e.kind === 'unavailable' ? 'not_set_up' : 'search_failed' }, { status: 503 })
    }
  })
}

const Add = z.object({ imageUrl: z.string().refine(allowedImageUrl), title: z.string().min(1).max(200) })

/** Add a listing to the closet: its photo goes through the scan pipeline as a one-frame scan. Returns the scan job id. */
export async function POST(req: Request) {
  return withUser(async (u) => {
    const body = Add.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request' }, { status: 400 })
    const storage = getStorage()
    const image = await fetchProductImage(body.data.imageUrl, storage).catch(() => null)
    if (!image) return Response.json({ error: 'image_failed' }, { status: 502 })
    const models = getModels()
    const frameUrl = await storage.put(`${userKey(u.userId)}/scans/${randomUUID()}/frame-000.jpg`, image, 'image/jpeg')
    const repo = await getRepo()
    const job = await repo.createScanJob(u.userId, frameUrl, [frameUrl])
    after(async () => {
      const listing = await models.tagger.fromListing(body.data.title).catch(() => undefined)
      await runScan(job.id, { userId: u.userId, models, repo, storage, listing })
    })
    return Response.json({ id: job.id })
  })
}
