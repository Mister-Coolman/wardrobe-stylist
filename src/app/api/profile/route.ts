import { z } from 'zod'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { profileFor } from '@/lib/profile'

const Patch = z.object({ renderMode: z.enum(['tryon', 'flatlay', 'none']) }).partial()

export async function GET() {
  return withUser(async (u) => Response.json({ profile: await profileFor(await getRepo(), u.userId) }))
}

export async function PATCH(req: Request) {
  return withUser(async (u) => {
    const body = Patch.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request' }, { status: 400 })
    const repo = await getRepo()
    await repo.upsertProfile({ ...(await profileFor(repo, u.userId)), ...body.data })
    return Response.json({ ok: true })
  })
}
