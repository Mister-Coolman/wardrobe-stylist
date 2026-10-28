import { z } from 'zod'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { washPatch } from '@/lib/garments'
import { GarmentTagsSchema } from '@/lib/models/schemas'

const Patch = GarmentTagsSchema.partial().extend({
  status: z.enum(['clean', 'worn', 'laundry']).optional(),
  wearsSinceWash: z.number().int().min(0).optional(),
  wearLimitOverride: z.number().int().min(1).nullable().optional(),
  confirmed: z.boolean().optional(),
})
const Body = z.union([
  z.object({ confirmIds: z.array(z.string()).min(1) }),
  z.object({ id: z.string(), patch: Patch }),
])

export async function GET() {
  return withUser(async (u) => Response.json({ garments: await (await getRepo()).listGarments(u.userId, { confirmed: true }) }))
}

export async function PATCH(req: Request) {
  return withUser(async (u) => {
    const body = Body.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request' }, { status: 400 })
    const repo = await getRepo()
    const data = body.data
    if ('confirmIds' in data) {
      for (const id of data.confirmIds) await repo.updateGarment(u.userId, id, { confirmed: true })
    } else {
      const current = (await repo.listGarments(u.userId)).find((g) => g.id === data.id)
      if (!current) return Response.json({ error: 'not_found' }, { status: 404 })
      await repo.updateGarment(u.userId, current.id, washPatch(current, data.patch))
    }
    return Response.json({ ok: true })
  })
}

export async function DELETE(req: Request) {
  return withUser(async (u) => {
    const { id } = (await req.json().catch(() => ({}))) as { id?: string }
    if (!id) return Response.json({ error: 'bad_request' }, { status: 400 })
    await (await getRepo()).deleteGarment(u.userId, id)
    return Response.json({ ok: true })
  })
}
