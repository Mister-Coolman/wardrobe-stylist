import 'server-only'
import { createHash } from 'node:crypto'
import type { Garment, Outfit, Profile, RenderMode } from '@/lib/domain/types'
import { getModels } from '@/lib/models'
import { drawLook } from '@/lib/renderCache'
import { getStorage, userKey } from '@/lib/storage'

export const TRYON_NEEDS_PHOTO = 'Add a photo of you in Settings for try-on.'

/** Renders come back as data: or remote URLs; keep them in our storage so the outfit has a stable URL. */
export async function persistRender(userId: string, url: string): Promise<string> {
  let data: Buffer, ext = 'png'
  const m = url.match(/^data:image\/(\w+);base64,(.*)$/)
  if (m) { ext = m[1] === 'jpeg' ? 'jpg' : m[1]; data = Buffer.from(m[2], 'base64') }
  else if (/^https?:/.test(url)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`render download ${res.status}`)
    data = Buffer.from(await res.arrayBuffer())
    ext = res.headers.get('content-type')?.includes('jpeg') ? 'jpg' : 'png'
  } else return url
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 20)
  return getStorage().put(`${userKey(userId)}/renders/${hash}.${ext}`, data, ext === 'jpg' ? 'image/jpeg' : 'image/png')
}

export type RenderOutcome = { renderMode: RenderMode; renderUrl: string | null; note?: string; error?: 'render_failed' }

export async function renderOutfit(outfit: Outfit, pieces: Garment[], profile: Profile, mode: RenderMode, opts: { forceFail?: boolean } = {}): Promise<RenderOutcome> {
  if (mode === 'none') return { renderMode: 'none', renderUrl: null }
  let note: string | undefined
  if (mode === 'tryon' && !profile.personPhotoUrl) { mode = 'flatlay'; note = TRYON_NEEDS_PHOTO }
  try {
    if (opts.forceFail) throw new Error('forced render failure')
    const url = await drawLook({ userId: profile.userId, mode, pieces, personPhotoUrl: profile.personPhotoUrl, renderer: getModels().renderer })
    return { renderMode: mode, renderUrl: url, note }
  } catch (e) {
    console.error('render failed', e)
    return { renderMode: 'none', renderUrl: null, note, error: 'render_failed' }
  }
}
