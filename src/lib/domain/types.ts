import type { Product } from '@/lib/shop/search'
import type { RuleResult, Violation } from '@/lib/rules/types'

export type { RuleResult, Violation }

export type Category = 'top' | 'bottom' | 'onepiece' | 'outerwear' | 'shoes' | 'accessory' | 'underwear' | 'socks'
export type Subcategory =
  | 'tshirt' | 'dress_shirt' | 'shirt' | 'sweater' | 'jeans' | 'trousers' | 'shorts' | 'skirt' | 'sweatpants'
  | 'athletic' | 'dress' | 'coat' | 'jacket' | 'boots' | 'sneakers' | 'dress_shoes' | 'other'
export type Level = 1 | 2 | 3 | 4 | 5
export type GarmentStatus = 'clean' | 'worn' | 'laundry'

export type Fit = 'slim' | 'classic' | 'relaxed' | 'oversized'
/** tags: material and details ("pique", "deck polo"); brand and fit: what the owner knows, or the tagger could read */
export interface Garment {
  id: string; userId: string; name: string; category: Category; subcategory: Subcategory
  colors: string[]; pattern: string; formality: Level; warmth: Level; rainSafe: boolean; tags: string[]
  brand?: string | null; fit?: Fit | null
  status: GarmentStatus; wearLimitOverride: number | null; wearsSinceWash: number; wearCount: number
  lastWornAt: string | null; cutoutUrl: string; photoUrl: string; confirmed: boolean
}

/** null = unlimited */
export type WearLimits = Partial<Record<Subcategory | Category, number | null>>
export type RenderMode = 'tryon' | 'mannequin' | 'flatlay' | 'none'

export interface StyleProfile { summary: string; traits: string[]; palette: string[]; avoid: string[]; sourceImages: string[] }

export type TempUnit = 'C' | 'F'
/** tempUnit: set once the user picks one in settings; until then the time zone decides (unitFor) */
export interface Profile {
  userId: string; homeCity: string; homeLat: number; homeLon: number; tz: string
  personPhotoUrl: string | null; renderMode: RenderMode; wearLimits: WearLimits; styleProfile: StyleProfile | null
  tempUnit?: TempUnit | null
  /** standing preferences the owner told the stylist ("navy with olive"); pieceIds when the note is a pairing */
  stylistNotes?: StylistNote[]
  /** WhatsApp sender id once linked; the link code is pending until it expires */
  whatsappId?: string | null; whatsappLinkCode?: string | null; whatsappLinkExpires?: string | null
}

export interface StylistNote { id: string; text: string; pieceIds: string[] }

/** What a stylist message shows besides its text. Card buttons just send a message, so they work the same on WhatsApp. */
export type Card =
  | { kind: 'outfit'; outfitId: string; date: string; imageUrl?: string; pieces: { id: string; name: string; cutoutUrl: string }[] }
  /** pending: found in a photo, not added until the owner says yes */
  | { kind: 'pieces'; pieces: { id: string; name: string; cutoutUrl: string; status: string }[]; pending?: boolean }
  | { kind: 'listings'; products: Product[] }
  | { kind: 'trip'; tripId: string; destination: string; days: number }
  | { kind: 'added'; garmentIds: string[] }

/** One message in the stylist thread. replyTo: the message it answers (swipe to reply); waIds: its WhatsApp message ids */
export interface Message {
  id: string; userId: string; role: 'user' | 'assistant'; text: string; cards: Card[]; imageUrl: string | null
  channel: 'web' | 'whatsapp' | 'system'; replyTo: string | null; waIds: string[]; createdAt: string
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

export interface DayPlan {
  date: string; outfitId: string | null; note: string
  weather?: Pick<Weather, 'tempHighC' | 'tempLowC' | 'rainProbability' | 'windKph' | 'summary'>
}
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

export interface Poll { slug: string; userId: string; outfitIds: string[]; date: string; eventId: string | null; createdAt: string }
