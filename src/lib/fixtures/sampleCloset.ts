import type { Garment } from '@/lib/domain/types'
import { FIXTURE_TAGS } from '@/lib/models/fixtures/garments'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/** The mockup wardrobe, with SVG cutouts from public/fixtures (scripts/make-fixtures.mjs). */
export function sampleCloset(userId: string): Omit<Garment, 'id'>[] {
  return FIXTURE_TAGS.map((t) => ({
    userId, ...t, status: t.subcategory === 'tshirt' ? 'laundry' : 'clean', wearLimitOverride: null,
    wearsSinceWash: t.subcategory === 'jeans' ? 4 : 0, wearCount: t.subcategory === 'jeans' ? 9 : 0, lastWornAt: null,
    cutoutUrl: `/fixtures/garments/${slug(t.name)}.svg`, photoUrl: '', confirmed: true,
  }))
}
