/** message is user-facing copy */
export interface Violation { ruleId: string; garmentIds: string[]; message: string }
/** shown as a fitting note */
export interface RuleResult { ruleId: string; passed: boolean; note: string }
