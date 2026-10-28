import { withUser } from '@/lib/api'
import { getModels } from '@/lib/models'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: Request) {
  return withUser(async () => {
    const audio = (await req.formData()).get('audio')
    if (!(audio instanceof File) || !audio.size) return Response.json({ error: 'no_audio' }, { status: 400 })
    if (audio.size > MAX_BYTES) return Response.json({ error: 'too_long' }, { status: 413 })
    const text = await getModels().transcriber.transcribe(Buffer.from(await audio.arrayBuffer()), audio.type || 'audio/webm')
    return Response.json({ text })
  })
}
