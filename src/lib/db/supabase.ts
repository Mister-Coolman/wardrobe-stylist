import { createClient } from '@supabase/supabase-js'
import { supabaseServerKey } from './supabaseKey'
import { nanoid } from 'nanoid'
import type { CalendarEvent, Garment, Message, Outfit, Poll, Profile, ScanJob, Trip } from '@/lib/domain/types'
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

// messages keep created_at: it orders the thread and pages it
const message = (r: Record<string, unknown> | null) => fromRow<Message>(r, [])

/** Postgres-backed repo. Server-only: uses the service-role key, every query filtered by user_id. */
export function createSupabaseRepo(): Repo {
  const db = createClient(process.env.SUPABASE_URL!, supabaseServerKey(), { auth: { persistSession: false } })
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

    async hasWorn(userId, outfitId, date) {
      const rows = ok(await db.from('wear_logs').select('id').eq('user_id', userId).eq('outfit_id', outfitId).eq('date', date).limit(1))
      return !!rows?.length
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

    async createPoll(userId, outfitIds, date, eventId) {
      return fromRow<Poll>(ok(await db.from('polls').insert({ slug: nanoid(8), user_id: userId, outfit_ids: outfitIds, date, event_id: eventId ?? null }).select().single()), [])!
    },
    async getPoll(slug) { return fromRow<Poll>(ok(await db.from('polls').select().eq('slug', slug).maybeSingle()), []) },
    async latestPollFor(userId, date) {
      return fromRow<Poll>(ok(await db.from('polls').select().eq('user_id', userId).eq('date', date).order('created_at', { ascending: false }).limit(1).maybeSingle()), [])
    },
    async vote(slug, outfitId, voterKey) {
      const poll = await repo.getPoll(slug)
      if (!poll || !poll.outfitIds.includes(outfitId)) return 'invalid'
      const { error } = await db.from('poll_votes').insert({ slug, outfit_id: outfitId, voter_key: voterKey })
      if (error?.code === '23505') return 'duplicate'
      if (error) throw new Error(error.message)
      return 'ok'
    },
    async tally(slug) {
      const out: Record<string, number> = {}
      for (const v of ok(await db.from('poll_votes').select('outfit_id').eq('slug', slug)) ?? []) out[v.outfit_id] = (out[v.outfit_id] ?? 0) + 1
      return out
    },

    async listProfiles() { return (ok(await db.from('profiles').select()) ?? []).map((r) => fromRow<Profile>(r)!) },
    async profileByWhatsapp(waId) { return fromRow<Profile>(ok(await db.from('profiles').select().eq('whatsapp_id', waId).maybeSingle())) },
    async addMessage(m) { return message(ok(await db.from('messages').insert(toRow(m)).select().single()))! },
    async listMessages(userId, opts = {}) {
      let q = db.from('messages').select().eq('user_id', userId).order('created_at', { ascending: false }).limit(opts.limit ?? 50)
      if (opts.before) q = q.lt('created_at', opts.before)
      return (ok(await q) ?? []).map((r) => message(r)!).reverse()
    },
    async getMessage(userId, id) { return message(ok(await db.from('messages').select().eq('user_id', userId).eq('id', id).maybeSingle())) },
    async messageByWaId(userId, waId) {
      return message(ok(await db.from('messages').select().eq('user_id', userId).contains('wa_ids', [waId]).limit(1).maybeSingle()))
    },
    async addWaIds(userId, id, waIds) {
      const m = await repo.getMessage(userId, id)
      if (m) ok(await db.from('messages').update({ wa_ids: [...new Set([...m.waIds, ...waIds])] }).eq('id', id).eq('user_id', userId))
    },
  }
  return repo
}
