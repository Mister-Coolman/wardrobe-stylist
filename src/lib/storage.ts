import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'

/** Media lives behind /api/media/<path>; the route checks the path belongs to the signed-in user. */
export interface StorageLike {
  put(path: string, data: Buffer, contentType: string): Promise<string>
  read(url: string): Promise<Buffer>
}

export const MEDIA_PREFIX = '/api/media/'

export function userKey(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16)
}

export function pathFromUrl(url: string): string {
  if (!url.startsWith(MEDIA_PREFIX)) throw new Error(`not a media url: ${url}`)
  const p = normalize(decodeURIComponent(url.slice(MEDIA_PREFIX.length)))
  if (p.startsWith('..') || p.startsWith('/')) throw new Error('bad media path')
  return p
}

/** The storage path for /api/media/<segments…>, or null unless every segment is plain and the first is the user's key. */
export function safeMediaPath(segments: string[], key: string): string | null {
  if (segments[0] !== key || segments.length < 2) return null
  if (segments.some((s) => !s || s === '.' || s === '..' || /[/\\\0]/.test(s))) return null
  return segments.join('/')
}

export function createMemoryStorage(): StorageLike {
  const files = new Map<string, Buffer>()
  return {
    async put(path, data) { files.set(path, data); return MEDIA_PREFIX + path },
    async read(url) { const b = files.get(pathFromUrl(url)); if (!b) throw new Error('missing'); return b },
  }
}

export function createLocalStorage(dir: string): StorageLike {
  return {
    async put(path, data) {
      const full = join(dir, path)
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, data)
      return MEDIA_PREFIX + path
    },
    async read(url) {
      if (url.startsWith('/fixtures/')) return readFile(join('public', url))
      return readFile(join(dir, pathFromUrl(url)))
    },
  }
}

export function createSupabaseStorage(): StorageLike {
  const client = import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).storage.from('media'))
  return {
    async put(path, data, contentType) {
      const { error } = await (await client).upload(path, data, { contentType, upsert: true })
      if (error) throw new Error(error.message)
      return MEDIA_PREFIX + path
    },
    async read(url) {
      if (url.startsWith('/fixtures/')) return readFile(join('public', url))
      const { data, error } = await (await client).download(pathFromUrl(url))
      if (error || !data) throw new Error(error?.message ?? 'missing')
      return Buffer.from(await data.arrayBuffer())
    },
  }
}

let instance: StorageLike | null = null
export function getStorage(): StorageLike {
  instance ??= process.env.SUPABASE_URL ? createSupabaseStorage() : createLocalStorage(process.env.MEDIA_DIR ?? '.data/media')
  return instance
}
