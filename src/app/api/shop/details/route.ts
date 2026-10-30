import { z } from 'zod'
import { withUser } from '@/lib/api'
import { getModels } from '@/lib/models'

const Body = z.object({ title: z.string().min(1).max(200) })

/** A listing title → name, brand, fit and details for a piece already in the closet */
export async function POST(req: Request) {
  return withUser(async () => {
    const body = Body.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request' }, { status: 400 })
    return Response.json({ details: await getModels().tagger.fromListing(body.data.title) })
  })
}
