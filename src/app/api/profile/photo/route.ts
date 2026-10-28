import sharp from 'sharp'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { profileFor } from '@/lib/profile'
import { getStorage, userKey } from '@/lib/storage'

/** The full-length photo used for try-on renders. Re-encoded (strips EXIF location) and capped at 1600 px. */
export async function POST(req: Request) {
  return withUser(async (u) => {
    const file = (await req.formData()).get('photo')
    if (!(file instanceof File) || !file.size) return Response.json({ error: 'no_photo' }, { status: 400 })
    let jpeg: Buffer
    try {
      jpeg = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    } catch { return Response.json({ error: 'not_an_image' }, { status: 400 }) }
    const url = await getStorage().put(`${userKey(u.userId)}/person/${Date.now()}.jpg`, jpeg, 'image/jpeg')
    const repo = await getRepo()
    await repo.upsertProfile({ ...(await profileFor(repo, u.userId)), personPhotoUrl: url })
    return Response.json({ personPhotoUrl: url })
  })
}

export async function DELETE() {
  return withUser(async (u) => {
    const repo = await getRepo()
    await repo.upsertProfile({ ...(await profileFor(repo, u.userId)), personPhotoUrl: null, renderMode: 'flatlay' })
    return Response.json({ ok: true })
  })
}
