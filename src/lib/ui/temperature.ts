import type { Profile, TempUnit } from '@/lib/domain/types'

/** US time zones (IANA), plus the US states' sub-zones; anywhere else defaults to °C. */
const US_ZONES = new Set(['America/New_York', 'America/Detroit', 'America/Chicago', 'America/Menominee', 'America/Denver', 'America/Boise',
  'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'America/Juneau', 'America/Sitka', 'America/Yakutat', 'America/Nome',
  'America/Metlakatla', 'America/Adak', 'Pacific/Honolulu'])
const US_PREFIXES = ['America/Indiana/', 'America/Kentucky/', 'America/North_Dakota/']

/** The unit the user chose in settings, or °F for a US home time zone and °C elsewhere. */
export function unitFor(p: Pick<Profile, 'tz' | 'tempUnit'>): TempUnit {
  if (p.tempUnit) return p.tempUnit
  return US_ZONES.has(p.tz) || US_PREFIXES.some((x) => p.tz.startsWith(x)) ? 'F' : 'C'
}

const convert = (c: number, unit: TempUnit) => Math.round(unit === 'F' ? (c * 9) / 5 + 32 : c)

/** Weather is stored in °C; this is how a temperature reaches the screen. */
export const degrees = (c: number, unit: TempUnit) => `${convert(c, unit)}°`

/** Rule and stylist notes are written in °C ("a low of 8°"); converts every temperature in one. */
export const withUnit = (text: string, unit: TempUnit) => (unit === 'C' ? text : text.replace(/(-?\d+(?:\.\d+)?)°/g, (_, n) => degrees(Number(n), unit)))
