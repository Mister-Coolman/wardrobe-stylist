import type { Repo } from '@/lib/db/repo'
import type { Garment } from '@/lib/domain/types'

/** A garment edit; moving a piece back to clean resets its wear count, renaming a clean piece does not. */
export function washPatch(current: Garment, patch: Partial<Garment>): Partial<Garment> {
  if (patch.status === 'clean' && current.status !== 'clean' && patch.wearsSinceWash === undefined) return { ...patch, wearsSinceWash: 0 }
  return patch
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
