import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { nanoid } from 'nanoid'
import type { CalendarEvent, Garment, Outfit, Poll, Profile, ScanJob, Trip, WearLog } from '@/lib/domain/types'
import type { Repo } from './repo'
import { laundryAfterWear } from './repo'

interface Db {
  profiles: Profile[]; garments: Garment[]; outfits: (Outfit & { createdAt: number })[]; wearLogs: WearLog[]
  events: CalendarEvent[]; trips: Trip[]; scanJobs: ScanJob[]
  polls: Poll[]; pollVotes: { slug: string; outfitId: string; voterKey: string }[]
}
const empty = (): Db => ({ profiles: [], garments: [], outfits: [], wearLogs: [], events: [], trips: [], scanJobs: [], polls: [], pollVotes: [] })

/** JSON-file store for development and tests until Supabase is set up. Read-modify-write per call. */
export function createLocalRepo(path: string): Repo {
  let seq = 0
  const load = (): Db => (existsSync(path) ? { ...empty(), ...JSON.parse(readFileSync(path, 'utf8')) } : empty())
  const save = (db: Db) => {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(db))
    renameSync(tmp, path)
  }
  const tx = <T>(f: (db: Db) => T): T => { const db = load(); const r = f(db); save(db); return r }
  const clone = <T>(x: T): T => structuredClone(x)

  return {
    async getProfile(userId) { return clone(load().profiles.find((p) => p.userId === userId) ?? null) },
    async upsertProfile(p) { tx((db) => { db.profiles = [...db.profiles.filter((x) => x.userId !== p.userId), p] }) },

    async listGarments(userId, opts) {
      return clone(load().garments.filter((g) => g.userId === userId && (opts?.confirmed === undefined || g.confirmed === opts.confirmed)))
    },
    async insertGarments(gs) {
      return tx((db) => { const out = gs.map((g) => ({ ...g, id: randomUUID() })); db.garments.push(...out); return clone(out) })
    },
    async updateGarment(userId, id, patch) {
      tx((db) => { const g = db.garments.find((x) => x.id === id && x.userId === userId); if (g) Object.assign(g, patch, { id, userId }) })
    },
    async deleteGarment(userId, id) { tx((db) => { db.garments = db.garments.filter((g) => !(g.id === id && g.userId === userId)) }) },

    async saveOutfit(o) {
      return tx((db) => { const out = { ...o, id: randomUUID(), createdAt: Date.now() * 1000 + (seq++ % 1000) }; db.outfits.push(out); return strip(out)! })
    },
    async getOutfit(userId, id) { return clone(strip(load().outfits.find((o) => o.id === id && o.userId === userId))) },
    async updateOutfit(userId, id, patch) {
      tx((db) => { const o = db.outfits.find((x) => x.id === id && x.userId === userId); if (o) Object.assign(o, patch, { id, userId }) })
    },
    async latestOutfitFor(userId, date) {
      const os = load().outfits.filter((o) => o.userId === userId && o.contextDate === date).sort((a, b) => b.createdAt - a.createdAt)
      return clone(strip(os[0]))
    },
    async listOutfitsFor(userId, date) {
      return load().outfits.filter((o) => o.userId === userId && o.contextDate === date).sort((a, b) => a.createdAt - b.createdAt).map((o) => strip(o)!)
    },

    async logWear(userId, outfitId, date, eventId, people = []) {
      tx((db) => {
        const outfit = db.outfits.find((o) => o.id === outfitId && o.userId === userId)
        if (!outfit) throw new Error('outfit not found')
        if (db.wearLogs.some((w) => w.userId === userId && w.outfitId === outfitId && w.date === date)) return
        const pieces = db.garments.filter((g) => g.userId === userId && outfit.garmentIds.includes(g.id))
        const toLaundry = new Set(laundryAfterWear(pieces, db.profiles.find((p) => p.userId === userId) ?? null))
        for (const g of pieces) {
          g.wearCount += 1
          g.wearsSinceWash += 1
          g.lastWornAt = date
          if (toLaundry.has(g.id)) g.status = 'laundry'
        }
        db.wearLogs.push({ id: randomUUID(), userId, date, outfitId, eventId: eventId ?? null, people })
      })
    },

    async hasWorn(userId, outfitId, date) {
      return load().wearLogs.some((w) => w.userId === userId && w.outfitId === outfitId && w.date === date)
    },

    async listUserEvents(userId, date) { return clone(load().events.filter((e) => e.userId === userId && e.date === date)) },
    async addUserEvent(e) { return tx((db) => { const out = { ...e, id: randomUUID() }; db.events.push(out); return clone(out) }) },

    async createScanJob(userId, mediaUrl, frameUrls) {
      return tx((db) => {
        const job: ScanJob = { id: randomUUID(), userId, mediaUrl, frameUrls, status: 'queued', progress: 0, foundCount: 0, error: null }
        db.scanJobs.push(job)
        return clone(job)
      })
    },
    async updateScanJob(id, patch) { tx((db) => { const j = db.scanJobs.find((x) => x.id === id); if (j) Object.assign(j, patch, { id }) }) },
    async getScanJob(userId, id) { return clone(load().scanJobs.find((j) => j.id === id && j.userId === userId) ?? null) },

    async saveTrip(t) { return tx((db) => { const out = { ...t, id: randomUUID() }; db.trips.push(out); return clone(out) }) },
    async getTrip(userId, id) { return clone(load().trips.find((t) => t.id === id && t.userId === userId) ?? null) },
    async listTrips(userId) { return clone(load().trips.filter((t) => t.userId === userId).sort((a, b) => a.startDate.localeCompare(b.startDate))) },

    async createPoll(userId, outfitIds, date, eventId) {
      return tx((db) => {
        const poll: Poll = { slug: nanoid(8), userId, outfitIds, date, eventId: eventId ?? null, createdAt: new Date(Date.now() + (seq++ % 1000)).toISOString() }
        db.polls.push(poll)
        return clone(poll)
      })
    },
    async getPoll(slug) { return clone(load().polls.find((p) => p.slug === slug) ?? null) },
    async latestPollFor(userId, date) {
      return clone(load().polls.filter((p) => p.userId === userId && p.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null)
    },
    async vote(slug, outfitId, voterKey) {
      return tx((db) => {
        const poll = db.polls.find((p) => p.slug === slug)
        if (!poll || !poll.outfitIds.includes(outfitId)) return 'invalid'
        if (db.pollVotes.some((v) => v.slug === slug && v.voterKey === voterKey)) return 'duplicate'
        db.pollVotes.push({ slug, outfitId, voterKey })
        return 'ok'
      })
    },
    async tally(slug) {
      const out: Record<string, number> = {}
      for (const v of load().pollVotes.filter((x) => x.slug === slug)) out[v.outfitId] = (out[v.outfitId] ?? 0) + 1
      return out
    },
  }
}

function strip(o: (Outfit & { createdAt: number }) | undefined): Outfit | null {
  if (!o) return null
  const { createdAt: _c, ...rest } = o
  return rest
}
