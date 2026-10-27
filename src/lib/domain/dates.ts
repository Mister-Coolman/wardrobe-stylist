/** 'YYYY-MM-DD' in the given IANA time zone. */
export function localDate(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** 'HH:MM' (24h) in the given time zone. */
export function localTime(tz: string, at: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
}

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(tz: string, at: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric',
    day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(at)).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60000)
}

/** UTC instant of local midnight on `date` in `tz`. */
export function zonedMidnight(date: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - offsetMinutes(tz, guess) * 60000
  t = guess - offsetMinutes(tz, t) * 60000
  return new Date(t)
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** [start, end) of the local day as ISO UTC strings. */
export function dayBoundsUtc(date: string, tz: string): [string, string] {
  return [zonedMidnight(date, tz).toISOString(), zonedMidnight(addDays(date, 1), tz).toISOString()]
}

export function daysBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}
