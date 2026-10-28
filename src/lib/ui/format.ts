import type { Category, Garment, Level, WearLimits } from '@/lib/domain/types'
import { limitFor } from '@/lib/domain/wearLimits'

export const FORMALITY: Record<Level, string> = { 1: 'Sporty', 2: 'Casual', 3: 'Smart casual', 4: 'Smart', 5: 'Formal' }
export const WARMTH: Record<Level, string> = { 1: 'Light', 2: 'Mid', 3: 'Warm', 4: 'Heavy', 5: 'Arctic' }
export const CATEGORY: Record<Category, string> = {
  top: 'Top', bottom: 'Bottom', onepiece: 'One-piece', outerwear: 'Outerwear', shoes: 'Shoes', accessory: 'Accessory', underwear: 'Underwear', socks: 'Socks',
}
export const CATEGORY_PLURAL: Record<Category, string> = {
  top: 'tops', bottom: 'bottoms', onepiece: 'one-pieces', outerwear: 'outerwear', shoes: 'shoes', accessory: 'accessories', underwear: 'underwear', socks: 'socks',
}

/** "Laundry", "Worn 4/5", "Worn 2" or null for a fresh piece. Words, never a colored dot. */
export function statusText(g: Garment, limits: WearLimits): string | null {
  if (g.status === 'laundry') return 'Laundry'
  if (!g.wearsSinceWash) return null
  const limit = limitFor(g, limits)
  return limit == null ? `Worn ${g.wearsSinceWash}` : `Worn ${g.wearsSinceWash}/${limit}`
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
