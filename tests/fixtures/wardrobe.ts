import type { CalendarEvent, Garment, Profile, Weather } from '@/lib/domain/types'
import { DEFAULT_WEAR_LIMITS } from '@/lib/domain/wearLimits'
import type { DayContext, RuleContext } from '@/lib/rules/types'

export const garment = (p: Partial<Garment> & Pick<Garment, 'id' | 'name' | 'category' | 'subcategory'>): Garment => ({
  userId: 'u1', colors: [], pattern: 'solid', formality: 2, warmth: 1, rainSafe: true, tags: [], status: 'clean',
  wearLimitOverride: null, wearsSinceWash: 0, wearCount: 0, lastWornAt: null, cutoutUrl: `/fixtures/${p.id}.png`,
  photoUrl: '', confirmed: true, ...p,
})

// Mirrors the Today mockup in docs/share/ui-style-guide.html
export const wardrobe: Garment[] = [
  garment({ id: 'coat', name: 'Navy wool overcoat', category: 'outerwear', subcategory: 'coat', colors: ['navy'], formality: 4, warmth: 4 }),
  garment({ id: 'crew', name: 'Oat merino crewneck', category: 'top', subcategory: 'sweater', colors: ['oat'], formality: 3, warmth: 3 }),
  garment({ id: 'oxford', name: 'White oxford shirt', category: 'top', subcategory: 'dress_shirt', colors: ['white'], formality: 4, warmth: 1 }),
  garment({ id: 'trousers', name: 'Charcoal wool trousers', category: 'bottom', subcategory: 'trousers', colors: ['charcoal'], formality: 4, warmth: 2 }),
  garment({ id: 'jeans', name: 'Selvedge jeans', category: 'bottom', subcategory: 'jeans', colors: ['indigo'], formality: 2, warmth: 2 }),
  garment({ id: 'loafers', name: 'Brown suede loafers', category: 'shoes', subcategory: 'dress_shoes', colors: ['brown'], formality: 4, rainSafe: false }),
  garment({ id: 'boots', name: 'Black leather boots', category: 'shoes', subcategory: 'boots', colors: ['black'], formality: 3 }),
  garment({ id: 'sneakers', name: 'White leather sneakers', category: 'shoes', subcategory: 'sneakers', colors: ['white'], formality: 2 }),
  garment({ id: 'tee', name: 'Rust cotton tee', category: 'top', subcategory: 'tshirt', colors: ['rust'], formality: 1, warmth: 1, status: 'laundry' }),
]

export const profile: Profile = {
  userId: 'u1', homeCity: 'Brooklyn', homeLat: 40.65, homeLon: -73.95, tz: 'America/New_York',
  personPhotoUrl: null, renderMode: 'flatlay', wearLimits: DEFAULT_WEAR_LIMITS, styleProfile: null,
}

export const weather = (p: Partial<Weather> = {}): Weather =>
  ({ tempHighC: 14, tempLowC: 9, rainProbability: 10, windKph: 10, summary: 'Cloudy', ...p })

export const event = (p: Partial<CalendarEvent> & Pick<CalendarEvent, 'title'>): CalendarEvent => ({
  id: p.title, userId: 'u1', date: '2026-10-27', start: null, end: null, allDay: false, location: null,
  attendees: [], source: 'calendar', ...p,
})

export const day = (p: Partial<DayContext> = {}): DayContext => ({
  date: '2026-10-27', events: [], weather: weather(), requiredFormality: 2, changeSuggestion: null, ...p,
})

export const ctx = (d: Partial<DayContext> = {}, gs: Garment[] = wardrobe): RuleContext =>
  ({ garments: new Map(gs.map((g) => [g.id, g])), day: day(d), profile })

export const cand = (...garmentIds: string[]) => ({ garmentIds, rationale: {}, title: 'Test look' })
