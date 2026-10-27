import { currentUser } from '@/lib/session'
import { getStorage, MEDIA_PREFIX, userKey } from '@/lib/storage'

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webm: 'video/webm', mp4: 'video/mp4', svg: 'image/svg+xml' }

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const u = await currentUser()
  const { path } = await params
  if (!u || path[0] !== userKey(u.userId)) return new Response('Not found', { status: 404 })
  try {
    const data = await getStorage().read(MEDIA_PREFIX + path.map(encodeURIComponent).join('/'))
    return new Response(new Uint8Array(data), { headers: { 'Content-Type': TYPES[path.at(-1)!.split('.').pop()!] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
