import { cookies } from 'next/headers'
import { z } from 'zod'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { profileFor } from '@/lib/profile'
import { renderOutfit } from '@/lib/render'

const Body = z.object({ outfitId: z.string(), mode: z.enum(['tryon', 'flatlay', 'none']) })

/** Re-renders an outfit in a mode; failure returns renderMode none so the pieces show instead. */
export async function POST(req: Request) {
  return withUser(async (u) => {
    const body = Body.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request' }, { status: 400 })
    const repo = await getRepo()
    const outfit = await repo.getOutfit(u.userId, body.data.outfitId)
    if (!outfit) return Response.json({ error: 'not_found' }, { status: 404 })
    const pieces = (await repo.listGarments(u.userId)).filter((g) => outfit.garmentIds.includes(g.id))
    const profile = await profileFor(repo, u.userId)
    // e2e hook: simulate a renderer outage in mock development only
    const forceFail = process.env.NODE_ENV !== 'production' && (process.env.MODELS ?? 'mock') === 'mock' && (await cookies()).get('mock_render_fail')?.value === '1'
    const r = await renderOutfit(outfit, pieces, profile, body.data.mode, { forceFail })
    await repo.updateOutfit(u.userId, outfit.id, { renderMode: r.renderMode, renderUrl: r.renderUrl })
    if (!r.error && profile.renderMode !== r.renderMode) await repo.upsertProfile({ ...profile, renderMode: r.renderMode })
    return Response.json(r)
  })
}
