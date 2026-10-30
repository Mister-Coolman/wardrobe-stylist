import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { runThread } from '@/lib/agent/thread'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { getModels, ModelError } from '@/lib/models'
import { getStorage, userKey } from '@/lib/storage'

// a look plus a render, or a photo scan, can take a while
export const maxDuration = 300

const MAX_IMAGE = 10 * 1024 * 1024

/** ?before=<iso> → the 50 messages before it, oldest first */
export async function GET(req: Request) {
  return withUser(async (u) => {
    const before = new URL(req.url).searchParams.get('before') ?? undefined
    return Response.json({ messages: await (await getRepo()).listMessages(u.userId, { before, limit: 50 }) })
  })
}

/** multipart: text, optional image (a photo), optional replyTo (a message id) → the saved message and the stylist's reply */
export async function POST(req: Request) {
  return withUser(async (u) => {
    const form = await req.formData().catch(() => null)
    const text = String(form?.get('text') ?? '').trim().slice(0, 2000)
    const image = form?.get('image')
    const replyTo = String(form?.get('replyTo') ?? '') || null
    if (!text && !(image instanceof File)) return Response.json({ error: 'bad_request' }, { status: 400 })
    const repo = await getRepo()
    let imageUrl: string | undefined
    if (image instanceof File) {
      if (image.size > MAX_IMAGE) return Response.json({ error: 'too_large' }, { status: 413 })
      const jpeg = await sharp(Buffer.from(await image.arrayBuffer())).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer().catch(() => null)
      if (!jpeg) return Response.json({ error: 'bad_image' }, { status: 400 })
      imageUrl = await getStorage().put(`${userKey(u.userId)}/thread/${randomUUID()}.jpg`, jpeg, 'image/jpeg')
    }
    try {
      return Response.json(await runThread(u, { text, imageUrl, replyTo, channel: 'web' }, { repo, models: getModels() }))
    } catch (e) {
      if (!(e instanceof ModelError)) throw e
      console.error('stylist failed', e)
      const [user] = (await repo.listMessages(u.userId, { limit: 1 }))
      return Response.json({ error: 'stylist_failed', user }, { status: 502 })
    }
  })
}
