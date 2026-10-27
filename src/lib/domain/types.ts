import type { RuleResult, Violation } from '@/lib/rules/types'

export type { RuleResult, Violation }

export type Category = 'top' | 'bottom' | 'onepiece' | 'outerwear' | 'shoes' | 'accessory' | 'underwear' | 'socks'
export type Subcategory =
  | 'tshirt' | 'dress_shirt' | 'shirt' | 'sweater' | 'jeans' | 'trousers' | 'shorts' | 'skirt' | 'sweatpants'
  | 'athletic' | 'dress' | 'coat' | 'jacket' | 'boots' | 'sneakers' | 'dress_shoes' | 'other'
export type Level = 1 | 2 | 3 | 4 | 5
export type GarmentStatus = 'clean' | 'worn' | 'laundry'

export interface Garment {
  id: string; userId: string; name: string; category: Category; subcategory: Subcategory
  colors: string[]; pattern: string; formality: Level; warmth: Level; rainSafe: boolean; tags: string[]
  status: GarmentStatus; wearLimitOverride: number | null; wearsSinceWash: number; wearCount: number
  lastWornAt: string | null; cutoutUrl: string; photoUrl: string; confirmed: boolean
}

/** null = unlimited */
export type WearLimits = Partial<Record<Subcategory | Category, number | null>>
export type RenderMode = 'tryon' | 'flatlay' | 'none'

export interface StyleProfile { summary: string; traits: string[]; palette: string[]; avoid: string[]; sourceImages: string[] }

export interface Profile {
  userId: string; homeCity: string; homeLat: number; homeLon: number; tz: string
  personPhotoUrl: string | null; renderMode: RenderMode; wearLimits: WearLimits; styleProfile: StyleProfile | null
}

export interface CalendarEvent {
  id: string; userId: string; date: string; start: string | null; end: string | null; allDay: boolean
  title: string; location: string | null; attendees: string[]; source: 'calendar' | 'user'; formality?: Level
}

export interface Weather { tempHighC: number; tempLowC: number; rainProbability: number; windKph: number; summary: string }

export interface Candidate { garmentIds: string[]; rationale: Record<string, string>; title: string }

export interface RevisionEntry { round: number; rejected: { candidate: Candidate; violations: Violation[] }[] }

export interface Outfit extends Candidate {
  id: string; userId: string; contextDate: string; ruleReport: RuleResult[]
  revisionLog: RevisionEntry[]; renderMode: RenderMode; renderUrl: string | null; source: 'agent' | 'user'
}

export interface DayPlan { date: string; outfitId: string | null; note: string }
export interface Trip {
  id: string; userId: string; destination: string; lat: number; lon: number; startDate: string; endDate: string
  dayPlans: DayPlan[]; packingList: { garmentId: string; days: number }[]; warnings: string[]
}

export type ScanStatus = 'queued' | 'segmenting' | 'tagging' | 'review' | 'failed'
export interface ScanJob {
  id: string; userId: string; mediaUrl: string; frameUrls: string[]; status: ScanStatus
  progress: number; foundCount: number; error: string | null
}

export interface WearLog { id: string; userId: string; date: string; outfitId: string; eventId: string | null; people: string[] }
