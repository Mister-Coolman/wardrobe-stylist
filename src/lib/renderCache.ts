import { createHash } from 'node:crypto'
import type { RenderMode } from '@/lib/domain/types'
import { RENDER_TIMEOUT_MS, withTimeout } from '@/lib/models/types'
import type { Renderer, RenderPiece } from '@/lib/models/types'
import { getStorage, MEDIA_PREFIX, userKey } from '@/lib/storage'
import type { StorageLike } from '@/lib/storage'

/** Bump when the render prompt changes, so looks drawn under the old prompt are drawn again */
export const RENDER_VERSION = 2

/** What the picture depends on: the view, each piece as the renderer is told about it, and the owner's photo for a try-on.
 *  Piece order doesn't matter (the renderer sorts them). */
function renderKey(mode: RenderMode, pieces: RenderPiece[], personPhotoUrl?: string | null): string {
  const described = pieces.map((p) => [p.cutoutUrl, p.name, p.category, p.subcategory, p.colors, p.tags, p.brand ?? null, p.fit ?? null])
    .map((x) => JSON.stringify(x)).sort()
  return createHash('sha256').update(JSON.stringify([RENDER_VERSION, mode, mode === 'tryon' ? personPhotoUrl ?? null : null, described])).digest('hex').slice(0, 24)
}

const EXT: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp' }

/** A look's picture in a view: from storage when this exact look was drawn that way before, else drawn and kept.
 *  A renderer that returns an app path (the mock's fixtures) is passed through. */
export async function drawLook(o: { userId: string; mode: Exclude<RenderMode, 'none'>; pieces: RenderPiece[]; personPhotoUrl?: string | null
  renderer: Renderer; storage?: StorageLike }): Promise<string> {
  const storage = o.storage ?? getStorage()
  const base = `${userKey(o.userId)}/renders/${o.mode}-${renderKey(o.mode, o.pieces, o.personPhotoUrl)}`
  for (const ext of new Set(Object.values(EXT))) {
    const url = `${MEDIA_PREFIX}${base}.${ext}`
    if (await storage.read(url).then(() => true, () => false)) return url
  }
  const { url } = await withTimeout(o.renderer.render({ mode: o.mode, pieces: o.pieces, personPhotoUrl: o.personPhotoUrl ?? undefined }), RENDER_TIMEOUT_MS, 'renderer')
  let data: Buffer, ext: string
  const m = url.match(/^data:image\/(\w+);base64,(.*)$/)
  if (m) { ext = EXT[m[1]] ?? 'png'; data = Buffer.from(m[2], 'base64') }
  else if (/^https?:/.test(url)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`render download ${res.status}`)
    data = Buffer.from(await res.arrayBuffer())
    ext = res.headers.get('content-type')?.includes('jpeg') ? 'jpg' : 'png'
  } else return url
  return storage.put(`${base}.${ext}`, data, ext === 'jpg' ? 'image/jpeg' : `image/${ext}`)
}
