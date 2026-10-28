/** Serverless request bodies are capped at 4.5 MB; stay under it with room for form overhead. */
export const UPLOAD_BUDGET = 4_000_000
export const STALL_MS = 90_000

/** Indices of frames to send: evenly thinned until they fit the budget, always keeping the first and last. */
export function thinToBudget(sizes: number[], budget: number): number[] {
  let keep = sizes.map((_, i) => i)
  const total = (ix: number[]) => ix.reduce((s, i) => s + sizes[i], 0)
  while (keep.length > 2 && total(keep) > budget) {
    const n = Math.max(2, Math.floor(keep.length * Math.min(0.9, budget / total(keep))))
    keep = Array.from({ length: n }, (_, k) => keep[Math.round((k * (keep.length - 1)) / (n - 1))])
  }
  return [...new Set(keep)]
}

/** True when the job's status/progress key hasn't changed for STALL_MS. */
export function isStalled(last: { key: string; since: number }, key: string, now: number): boolean {
  return key === last.key && now - last.since > STALL_MS
}
