import type { CalendarEvent, Garment, Outfit, Profile, ScanJob, Trip } from '@/lib/domain/types'
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
  /** Logs the wear and bumps wear_count / wears_since_wash / last_worn_at in one go; pieces at their limit go to the laundry. */
  logWear(userId: string, outfitId: string, date: string, eventId?: string, people?: string[]): Promise<void>
  listUserEvents(userId: string, date: string): Promise<CalendarEvent[]>
  addUserEvent(e: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent>
  createScanJob(userId: string, mediaUrl: string, frameUrls: string[]): Promise<ScanJob>
  updateScanJob(id: string, patch: Partial<ScanJob>): Promise<void>
  getScanJob(userId: string, id: string): Promise<ScanJob | null>
  saveTrip(t: Omit<Trip, 'id'>): Promise<Trip>
  getTrip(userId: string, id: string): Promise<Trip | null>
  listTrips(userId: string): Promise<Trip[]>
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
