import type { Garment, WearLimits } from './types'

/** Wears before a wash (spec §3). Subcategory wins over category; anything unlisted is unlimited. */
export const DEFAULT_WEAR_LIMITS: WearLimits = {
  underwear: 1, socks: 1,
  tshirt: 1, sweatpants: 1, athletic: 1,
  dress_shirt: 2, shirt: 2,
  sweater: 3, trousers: 3,
  jeans: 5,
  outerwear: null, shoes: null, accessory: null,
}

export function limitFor(g: Garment, limits: WearLimits): number | null {
  if (g.wearLimitOverride != null) return g.wearLimitOverride
  if (g.subcategory in limits) return limits[g.subcategory] ?? null
  if (g.category in limits) return limits[g.category] ?? null
  return null
}
