import sharp from 'sharp'
import type { StorageLike } from '@/lib/storage'

/** The client sends back a photo url from the search results, so only the search's own image hosts are fetched
 *  (no redirects, size-capped): anything else would let a caller make the server fetch any address. */
const IMAGE_HOSTS = [/^serpapi\.com$/, /^encrypted-tbn\d\.gstatic\.com$/, /(^|\.)googleusercontent\.com$/]
const MAX_BYTES = 8 * 1024 * 1024

export function allowedImageUrl(url: string): boolean {
  if (/^\/fixtures\/garments\/[\w-]+\.svg$/.test(url)) return true
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && !u.port && IMAGE_HOSTS.some((h) => h.test(u.hostname))
  } catch { return false }
}

/** A product photo as a JPEG on white, ready to go through the scan pipeline like a camera frame. */
export async function fetchProductImage(url: string, storage: Pick<StorageLike, 'read'>): Promise<Buffer> {
  if (!allowedImageUrl(url)) throw new Error('image host not allowed')
  let raw: Buffer
  if (url.startsWith('/fixtures/')) raw = await storage.read(url)
  else {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`image fetch failed: ${res.status}`)
    if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('image too large')
    raw = Buffer.from(await res.arrayBuffer())
    if (raw.length > MAX_BYTES) throw new Error('image too large')
  }
  return sharp(raw, { density: 200 }).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer()
}
