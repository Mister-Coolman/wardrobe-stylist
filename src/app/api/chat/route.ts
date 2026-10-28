import { z } from 'zod'
import { runChat } from '@/lib/agent/chat'
import { withUser } from '@/lib/api'
import { getRepo } from '@/lib/db/repo'
import { getModels } from '@/lib/models'

const Body = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) })).min(1).max(30) })

export async function POST(req: Request) {
  return withUser(async (u) => {
    const body = Body.safeParse(await req.json().catch(() => null))
    if (!body.success) return Response.json({ error: 'bad_request' }, { status: 400 })
    return Response.json(await runChat(u, body.data.messages, { repo: await getRepo(), models: getModels() }))
  })
}
