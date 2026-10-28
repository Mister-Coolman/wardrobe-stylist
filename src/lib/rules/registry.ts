import type { Candidate } from '@/lib/domain/types'
import { availability } from './availability'
import { capsuleReuse } from './capsuleReuse'
import { completeness } from './completeness'
import { formality } from './formality'
import type { Rule, RuleContext, RuleResult, Violation } from './types'
import { weather } from './weather'
import { wearLimit } from './wearLimit'

export const dailyRules: Rule[] = [completeness, formality, weather, availability]
export const tripRules: Rule[] = [...dailyRules, wearLimit, capsuleReuse]

export function runRules(c: Candidate, ctx: RuleContext, rules: Rule[]): { violations: Violation[]; results: RuleResult[]; softScore: number } {
  const violations: Violation[] = []
  const results: RuleResult[] = []
  let softScore = 0
  for (const rule of rules) {
    if (rule.kind === 'soft') {
      softScore += rule.score?.(c, ctx) ?? 0
      results.push({ ruleId: rule.id, passed: true, note: rule.note(c, ctx) })
      continue
    }
    const v = rule.check(c, ctx)
    violations.push(...v)
    results.push({ ruleId: rule.id, passed: v.length === 0, note: v.length ? v.map((x) => x.message).join('; ') : rule.note(c, ctx) })
  }
  return { violations, results, softScore }
}
