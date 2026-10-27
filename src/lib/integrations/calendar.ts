import type { CalendarEvent } from '@/lib/domain/types'
import { dayBoundsUtc, localDate, localTime } from '@/lib/domain/dates'

export class CalendarAuthError extends Error {
  constructor() { super('calendar token rejected'); this.name = 'CalendarAuthError' }
}

interface GEvent {
  id: string; summary?: string; status?: string; location?: string
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }
  attendees?: { email?: string; self?: boolean }[]
}

/** Google Calendar events.list over the user's local day (primary calendar plus every selected one). */
export async function fetchCalendarEvents(accessToken: string, date: string, tz: string, userId = ''): Promise<CalendarEvent[]> {
  return fetchCalendarRange(accessToken, date, date, tz, userId)
}

export async function fetchCalendarRange(accessToken: string, startDate: string, endDate: string, tz: string, userId = ''): Promise<CalendarEvent[]> {
  const [timeMin] = dayBoundsUtc(startDate, tz)
  const [, timeMax] = dayBoundsUtc(endDate, tz)
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.search = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin, timeMax, maxResults: '250', timeZone: tz }).toString()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) })
  if (res.status === 401 || res.status === 403) throw new CalendarAuthError()
  if (!res.ok) throw new Error(`calendar ${res.status}`)
  const { items = [] } = (await res.json()) as { items?: GEvent[] }
  return items.filter((e) => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date)).map((e) => {
    const allDay = !e.start!.dateTime
    const start = allDay ? null : new Date(e.start!.dateTime!)
    const end = e.end?.dateTime ? new Date(e.end.dateTime) : null
    return {
      id: `gcal:${e.id}`, userId,
      date: allDay ? e.start!.date! : localDate(tz, start!),
      start: start ? localTime(tz, start) : null, end: end ? localTime(tz, end) : null, allDay,
      title: e.summary?.trim() || 'Busy', location: e.location ?? null,
      attendees: (e.attendees ?? []).filter((a) => !a.self && a.email).map((a) => a.email!), source: 'calendar' as const,
    }
  }).filter((e) => e.date >= startDate && e.date <= endDate)
}
