import type { Garment } from '@/lib/domain/types'

/** A garment edit; moving a piece back to clean resets its wear count, renaming a clean piece does not. */
export function washPatch(current: Garment, patch: Partial<Garment>): Partial<Garment> {
  if (patch.status === 'clean' && current.status !== 'clean' && patch.wearsSinceWash === undefined) return { ...patch, wearsSinceWash: 0 }
  return patch
}
