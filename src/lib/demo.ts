import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { CalendarEvent } from '@/lib/domain/types'
import type { Repo } from '@/lib/db/repo'
import { localDate } from '@/lib/domain/dates'
import { defaultProfile } from '@/lib/profile'
import { MEDIA_PREFIX, pathFromUrl, userKey } from '@/lib/storage'
import type { StorageLike } from '@/lib/storage'

// "Try the demo": judges get in without Google. Each visitor is a fresh user with a copy of the owner's closet
// (DEMO_SOURCE_USER) and a sample calendar, so nobody sees anyone else's data and the owner's stays untouched.

export const DEMO_COOKIE = 'ws_demo_user'
const DOMAIN = 'demo.wardrobe-stylist.xyz'
/** Cutouts copied at once: copying all ~37 together made storage fail with "fetch failed" for judges */
const COPIES_AT_ONCE = 4

/** Runs f over items, `n` at a time, keeping their order */
async function inBatches<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await f(items[i]) }
  }))
  return out
}

/** New demo users a day, so a public button can't run through the model credits */
export const DEMO_DAILY_CAP = 50

export const isDemo = (userId: string) => userId.endsWith(`@${DOMAIN}`)

const sign = (id: string, secret: string) => createHmac('sha256', secret).update(id).digest('base64url')

/** Cookie value: the demo user id and an HMAC over it (AUTH_SECRET), so the cookie can't name any other user. */
export function signDemo(id: string): string {
  return `${id}.${sign(id, process.env.AUTH_SECRET ?? '')}`
}

export function demoSession(cookie: string | undefined): { userId: string; email: string; googleAccessToken: null } | null {
  const secret = process.env.AUTH_SECRET
  if (!cookie || !secret) return null
  const dot = cookie.lastIndexOf('.')
  const id = cookie.slice(0, dot), mac = Buffer.from(cookie.slice(dot + 1))
  const want = Buffer.from(sign(id, secret))
  if (dot < 0 || !isDemo(id) || mac.length !== want.length || !timingSafeEqual(mac, want)) return null
  return { userId: id, email: id, googleAccessToken: null }
}

/** The sample calendar, on whatever day it's asked for, so a judge coming back tomorrow still has a day to dress for. */
export function demoEvents(userId: string, date: string): CalendarEvent[] {
  const ev = (title: string, start: string, end: string, location: string): CalendarEvent =>
    ({ id: `demo-${date}-${start}`, userId, date, start, end, allDay: false, title, location, attendees: [], source: 'calendar' })
  return [ev('Lunch with friends', '12:30', '13:30', 'Midtown'), ev('Drinks after work', '18:30', '20:00', 'Lower East Side')]
}

/** A new demo user seeded from the owner's confirmed closet; null when today's cap is reached or the owner has no closet. */
export async function startDemo(repo: Repo, storage: StorageLike, sourceUserId: string, now = new Date()): Promise<string | null> {
  const day = localDate('UTC', now).replaceAll('-', '')
  const today = (await repo.listProfiles()).filter((p) => p.userId.startsWith(`demo-${day}-`))
  if (today.length >= DEMO_DAILY_CAP) return null
  const closet = await repo.listGarments(sourceUserId, { confirmed: true })
  if (!closet.length) return null

  const id = `demo-${day}-${randomBytes(6).toString('hex')}@${DOMAIN}`
  const from = `${userKey(sourceUserId)}/`, to = userKey(id)
  // media is per user (the route checks the key), so each cutout is copied under the demo user's key
  const copy = async (url: string) => {
    if (!url.startsWith(MEDIA_PREFIX + from)) return url
    const path = pathFromUrl(url)
    const once = async () => storage.put(`${to}/${path.slice(from.length)}`, await storage.read(url), path.endsWith('.png') ? 'image/png' : 'image/jpeg')
    // a dropped connection gets one more try after a short pause
    return once().catch(async () => { await new Promise((r) => setTimeout(r, 300)); return once() })
  }
  const pieces = await inBatches(closet, COPIES_AT_ONCE, async ({ id: _, ...g }) => {
    const cutoutUrl = await copy(g.cutoutUrl)
    return { ...g, userId: id, cutoutUrl, photoUrl: cutoutUrl }
  })
  await repo.insertGarments(pieces)
  await repo.upsertProfile(defaultProfile(id))
  return id
}
