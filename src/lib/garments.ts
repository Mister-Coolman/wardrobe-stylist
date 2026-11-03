import type { Repo } from '@/lib/db/repo'
import type { Garment } from '@/lib/domain/types'
import { turned } from '@/lib/scan/cutout'
import { putCutout } from '@/lib/scan/pipeline'
import { MEDIA_PREFIX, userKey } from '@/lib/storage'
import type { StorageLike } from '@/lib/storage'

/** A garment edit; moving a piece back to clean resets its wear count, renaming a clean piece does not. */
export function washPatch(current: Garment, patch: Partial<Garment>): Partial<Garment> {
  if (patch.status === 'clean' && current.status !== 'clean' && patch.wearsSinceWash === undefined) return { ...patch, wearsSinceWash: 0 }
  return patch
}

const COLOR_WORDS = new Set(['black', 'white', 'grey', 'gray', 'navy', 'blue', 'red', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'tan',
  'beige', 'cream', 'ivory', 'olive', 'khaki', 'maroon', 'burgundy', 'teal', 'charcoal', 'indigo', 'camel', 'oat', 'rust', 'mustard', 'lavender',
  'gold', 'silver', 'sand', 'stone', 'taupe', 'coral', 'mint'])
const SHADES = new Set(['light', 'dark', 'pale', 'deep', 'bright', 'heather'])
const norm = (w: string) => (w === 'gray' ? 'grey' : w)

/** The colours a piece's name gives, a shade kept with its colour ("heather blue"); khaki only when it's the sole colour, else it's a style */
export function colorsFromName(name: string): string[] {
  const runs: string[][] = [[]]
  for (const w of name.toLowerCase().split(/[^a-z]+/)) {
    if (COLOR_WORDS.has(w) || SHADES.has(w)) runs.at(-1)!.push(w)
    else if (runs.at(-1)!.length) runs.push([])
  }
  const colors = runs.filter((r) => r.some((w) => COLOR_WORDS.has(w))).map((r) => r.join(' '))
  return colors.length > 1 ? colors.filter((c) => c !== 'khaki') : colors
}

/** A rename whose colours the saved ones contradict ("Heather blue …" saved as grey from a dim photo) takes the name's colours:
 *  the stylist and the pictures read the saved colours, the owner reads the name. */
export function namePatch(current: Garment, patch: Partial<Garment>): Partial<Garment> {
  if (!patch.name || patch.colors) return patch
  const named = colorsFromName(patch.name)
  const words = (cs: string[]) => new Set(cs.flatMap((c) => c.toLowerCase().split(/\s+/)).filter((w) => COLOR_WORDS.has(w)).map(norm))
  const saved = words(current.colors)
  if (!named.length || [...words(named)].some((w) => saved.has(w))) return patch
  return { ...patch, colors: named }
}

/** Turns a piece's cutout a quarter turn clockwise, for a piece the scan left sideways. The new image gets its own url,
 *  so looks drawn with the old one are drawn again. null when it isn't theirs or has no stored cutout (a sample piece). */
export async function rotateCutout(repo: Repo, storage: StorageLike, userId: string, id: string): Promise<string | null> {
  const g = (await repo.listGarments(userId)).find((x) => x.id === id)
  if (!g?.cutoutUrl.startsWith(`${MEDIA_PREFIX}${userKey(userId)}/`)) return null
  const cutoutUrl = await putCutout(storage, userId, await turned(await storage.read(g.cutoutUrl), 90))
  await repo.updateGarment(userId, g.id, { cutoutUrl, ...(g.photoUrl === g.cutoutUrl ? { photoUrl: cutoutUrl } : {}) })
  return cutoutUrl
}

export const MAX_COPIES = 5

/** Another of a piece the owner has more than one of: same details and photo (deleting a piece leaves its image),
 *  but its own wear count and laundry status, so one can be in the wash while the other is worn. [] if it isn't theirs. */
export async function duplicateGarment(repo: Repo, userId: string, id: string, count = 1): Promise<Garment[]> {
  const g = (await repo.listGarments(userId)).find((x) => x.id === id)
  if (!g) return []
  const { id: _id, ...rest } = g
  const copy = { ...rest, status: 'clean' as const, wearsSinceWash: 0, wearCount: 0, lastWornAt: null }
  return repo.insertGarments(Array.from({ length: Math.min(Math.max(1, count), MAX_COPIES) }, () => ({ ...copy })))
}
