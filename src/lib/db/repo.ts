import type { CalendarEvent, Garment, Message, Outfit, Poll, Profile, ScanJob, Trip } from '@/lib/domain/types'
import { DEFAULT_WEAR_LIMITS, limitFor } from '@/lib/domain/wearLimits'

/** Typed data access, every call scoped by userId (except background scan-job updates). */
export interface Repo {
  getProfile(userId: string): Promise<Profile | null>
  upsertProfile(p: Profile): Promise<void>
  listGarments(userId: string, opts?: { confirmed?: boolean }): Promise<Garment[]>
  insertGarments(gs: Omit<Garment, 'id'>[]): Promise<Garment[]>
  updateGarment(userId: string, id: string, patch: Partial<Garment>): Promise<void>
  deleteGarment(userId: string, id: string): Promise<void>
  saveOutfit(o: Omit<Outfit, 'id'>): Promise<Outfit>
  getOutfit(userId: string, id: string): Promise<Outfit | null>
  updateOutfit(userId: string, id: string, patch: Partial<Outfit>): Promise<void>
  latestOutfitFor(userId: string, date: string): Promise<Outfit | null>
  listOutfitsFor(userId: string, date: string): Promise<Outfit[]>
  /** Once per outfit per day: logs the wear and bumps wear_count / wears_since_wash / last_worn_at in one go; pieces at their limit go to the laundry. */
  logWear(userId: string, outfitId: string, date: string, eventId?: string, people?: string[]): Promise<void>
  /** Whether this outfit is already logged as worn on that date (logWear is a no-op then). */
  hasWorn(userId: string, outfitId: string, date: string): Promise<boolean>
  listUserEvents(userId: string, date: string): Promise<CalendarEvent[]>
  addUserEvent(e: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent>
  createScanJob(userId: string, mediaUrl: string, frameUrls: string[]): Promise<ScanJob>
  updateScanJob(id: string, patch: Partial<ScanJob>): Promise<void>
  getScanJob(userId: string, id: string): Promise<ScanJob | null>
  saveTrip(t: Omit<Trip, 'id'>): Promise<Trip>
  getTrip(userId: string, id: string): Promise<Trip | null>
  listTrips(userId: string): Promise<Trip[]>
  /** Stretch (Task 19). getPoll / vote / tally are public: anyone with the link can see and vote. */
  createPoll(userId: string, outfitIds: string[], date: string, eventId?: string): Promise<Poll>
  getPoll(slug: string): Promise<Poll | null>
  latestPollFor(userId: string, date: string): Promise<Poll | null>
  vote(slug: string, outfitId: string, voterKey: string): Promise<'ok' | 'duplicate' | 'invalid'>
  tally(slug: string): Promise<Record<string, number>>
  listProfiles(): Promise<Profile[]>
  profileByWhatsapp(waId: string): Promise<Profile | null>
  addMessage(m: Omit<Message, 'id' | 'createdAt'>): Promise<Message>
  /** Oldest first: the newest `limit` (default 50) strictly before `before` (an ISO time). */
  listMessages(userId: string, opts?: { before?: string; limit?: number }): Promise<Message[]>
  getMessage(userId: string, id: string): Promise<Message | null>
  messageByWaId(userId: string, waId: string): Promise<Message | null>
  addWaIds(userId: string, id: string, waIds: string[]): Promise<void>
}

/** Ids of the outfit's pieces that hit their wear limit with this wear. */
export function laundryAfterWear(pieces: Garment[], profile: Profile | null): string[] {
  const limits = profile?.wearLimits ?? DEFAULT_WEAR_LIMITS
  return pieces.filter((g) => {
    const limit = limitFor(g, limits)
    return limit != null && g.wearsSinceWash + 1 >= limit
  }).map((g) => g.id)
}

let instance: Repo | null = null

/** Supabase when SUPABASE_URL is set, otherwise the local JSON store in .data/ */
export async function getRepo(): Promise<Repo> {
  if (instance) return instance
  if (process.env.SUPABASE_URL) {
    const { createSupabaseRepo } = await import('./supabase')
    instance = createSupabaseRepo()
  } else {
    const { createLocalRepo } = await import('./local')
    instance = createLocalRepo(process.env.LOCAL_DB_PATH ?? '.data/db.json')
  }
  return instance!
}
