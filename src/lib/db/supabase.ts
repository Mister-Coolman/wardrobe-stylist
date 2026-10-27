import { createClient } from '@supabase/supabase-js'
import type { CalendarEvent, Garment, Outfit, Profile, ScanJob, Trip } from '@/lib/domain/types'
import type { Repo } from './repo'
import { laundryAfterWear } from './repo'

// camelCase ↔ snake_case, with the few columns whose names differ listed explicitly
const RENAME: Record<string, string> = { start: 'start_at', end: 'end_at' }
const snake = (k: string) => RENAME[k] ?? k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const camel = (k: string) => Object.entries(RENAME).find(([, v]) => v === k)?.[0] ?? k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
function toRow(o: object, drop: string[] = []): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([k, v]) => v !== undefined && !drop.includes(k)).map(([k, v]) => [snake(k), v]))
}
function fromRow<T>(r: Record<string, unknown> | null, drop: string[] = ['created_at', 'source_media_id']): T | null {
  if (!r) return null
  return Object.fromEntries(Object.entries(r).filter(([k]) => !drop.includes(k)).map(([k, v]) => [camel(k), v])) as T
}

/** Postgres-backed repo. Server-only: uses the service-role key, every query filtered by user_id. */
export function createSupabaseRepo(): Repo {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const ok = <T>({ data, error }: { data: T; error: { message: string } | null }): T => { if (error) throw new Error(error.message); return data }

  const repo: Repo = {
    async getProfile(userId) { return fromRow<Profile>(ok(await db.from('profiles').select().eq('user_id', userId).maybeSingle())) },
    async upsertProfile(p) { ok(await db.from('profiles').upsert(toRow(p))) },

    async listGarments(userId, opts) {
      let q = db.from('garments').select().eq('user_id', userId).order('created_at')
      if (opts?.confirmed !== undefined) q = q.eq('confirmed', opts.confirmed)
      return (ok(await q) ?? []).map((r) => fromRow<Garment>(r)!)
    },
    async insertGarments(gs) {
      if (!gs.length) return []
      return (ok(await db.from('garments').insert(gs.map((g) => toRow(g))).select()) ?? []).map((r) => fromRow<Garment>(r)!)
    },
    async updateGarment(userId, id, patch) { ok(await db.from('garments').update(toRow(patch, ['id', 'userId'])).eq('id', id).eq('user_id', userId)) },
    async deleteGarment(userId, id) { ok(await db.from('garments').delete().eq('id', id).eq('user_id', userId)) },

    async saveOutfit(o) { return fromRow<Outfit>(ok(await db.from('outfits').insert(toRow(o)).select().single()))! },
    async getOutfit(userId, id) { return fromRow<Outfit>(ok(await db.from('outfits').select().eq('id', id).eq('user_id', userId).maybeSingle())) },
    async updateOutfit(userId, id, patch) { ok(await db.from('outfits').update(toRow(patch, ['id', 'userId'])).eq('id', id).eq('user_id', userId)) },
    async latestOutfitFor(userId, date) {
      return fromRow<Outfit>(ok(await db.from('outfits').select().eq('user_id', userId).eq('context_date', date)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()))
    },
    async listOutfitsFor(userId, date) {
      return (ok(await db.from('outfits').select().eq('user_id', userId).eq('context_date', date).order('created_at')) ?? []).map((r) => fromRow<Outfit>(r)!)
    },

    async logWear(userId, outfitId, date, eventId, people = []) {
      const outfit = await repo.getOutfit(userId, outfitId)
      if (!outfit) throw new Error('outfit not found')
      const pieces = (await repo.listGarments(userId)).filter((g) => outfit.garmentIds.includes(g.id))
      const laundry = laundryAfterWear(pieces, await repo.getProfile(userId))
      ok(await db.rpc('log_wear', { p_user: userId, p_outfit: outfitId, p_date: date, p_event: eventId ?? null, p_people: people, p_laundry: laundry }))
    },

    async listUserEvents(userId, date) {
      return (ok(await db.from('events').select().eq('user_id', userId).eq('date', date).order('start_at')) ?? []).map((r) => fromRow<CalendarEvent>(r)!)
    },
    async addUserEvent(e) { return fromRow<CalendarEvent>(ok(await db.from('events').insert(toRow(e)).select().single()))! },

    async createScanJob(userId, mediaUrl, frameUrls) {
      return fromRow<ScanJob>(ok(await db.from('scan_jobs').insert({ user_id: userId, media_url: mediaUrl, frame_urls: frameUrls }).select().single()))!
    },
    async updateScanJob(id, patch) { ok(await db.from('scan_jobs').update(toRow(patch, ['id', 'userId'])).eq('id', id)) },
    async getScanJob(userId, id) { return fromRow<ScanJob>(ok(await db.from('scan_jobs').select().eq('id', id).eq('user_id', userId).maybeSingle())) },

    async saveTrip(t) { return fromRow<Trip>(ok(await db.from('trips').insert(toRow(t)).select().single()))! },
    async getTrip(userId, id) { return fromRow<Trip>(ok(await db.from('trips').select().eq('id', id).eq('user_id', userId).maybeSingle())) },
    async listTrips(userId) { return (ok(await db.from('trips').select().eq('user_id', userId).order('start_date')) ?? []).map((r) => fromRow<Trip>(r)!) },
  }
  return repo
}
