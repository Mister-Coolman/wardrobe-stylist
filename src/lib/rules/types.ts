/** message is user-facing copy */
export interface Violation { ruleId: string; garmentIds: string[]; message: string }
/** shown as a fitting note */
export interface RuleResult { ruleId: string; passed: boolean; note: string }

import type { CalendarEvent, Candidate, Garment, Level, Profile, Weather } from '@/lib/domain/types'

export interface DayContext {
  date: string; events: CalendarEvent[]; weather: Weather; requiredFormality: Level; changeSuggestion: string | null
}
/** garmentId → uses so far in the trip */
export interface TripUsage { counts: Record<string, number> }
export interface RuleContext { garments: Map<string, Garment>; day: DayContext; profile: Profile; trip?: TripUsage }
export interface Rule {
  id: string
  kind: 'hard' | 'soft'
  check(c: Candidate, ctx: RuleContext): Violation[]
  score?(c: Candidate, ctx: RuleContext): number
  note(c: Candidate, ctx: RuleContext): string
}

export function piecesOf(c: Candidate, ctx: RuleContext): Garment[] {
  return c.garmentIds.map((id) => ctx.garments.get(id)).filter((g): g is Garment => !!g)
}
