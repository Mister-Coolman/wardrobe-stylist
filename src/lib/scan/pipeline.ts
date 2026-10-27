import { createHash } from 'node:crypto'
import type { Garment } from '@/lib/domain/types'
import type { Repo } from '@/lib/db/repo'
import type { GarmentTags, Models } from '@/lib/models/types'
import { GarmentTagsSchema } from '@/lib/models/schemas'
import type { StorageLike } from '@/lib/storage'
import { userKey } from '@/lib/storage'
import { bestFrame, cutout, sharpnessOf } from './cutout'

export const NO_CLOTHES = 'No clothes found — try holding each piece up to the camera.'
export const SCAN_FAILED = 'The scan stopped partway — try again, or take a single photo.'

const UNTAGGED: GarmentTags = { name: 'Untagged piece', category: 'top', subcategory: 'other', colors: [], pattern: 'solid', formality: 2, warmth: 2, rainSafe: true, tags: [] }

interface Found { tags: GarmentTags; cutoutUrl: string; photoUrl: string; area: number }

/** segment → best frame → cutout → tag → dedupe → insert unconfirmed. Never throws; failures land on the job. */
export async function runScan(jobId: string, deps: { userId: string; models: Pick<Models, 'segmenter' | 'tagger'>; repo: Repo; storage: StorageLike }): Promise<void> {
  const { repo, storage, models, userId } = deps
  try {
    const job = await repo.getScanJob(userId, jobId)
    if (!job) return
    await repo.updateScanJob(jobId, { status: 'segmenting', progress: 0 })
    const tracks = await models.segmenter.segment(job.frameUrls)
    if (!tracks.length) { await repo.updateScanJob(jobId, { status: 'failed', error: NO_CLOTHES }); return }

    const frames = new Map<number, Buffer>()
    const frameAt = async (i: number) => { if (!frames.has(i)) frames.set(i, await storage.read(job.frameUrls[i])); return frames.get(i)! }
    const sharpness = new Map<number, number>()
    for (const i of new Set(tracks.flatMap((t) => t.masks.map((m) => m.frameIndex)))) sharpness.set(i, await sharpnessOf(await frameAt(i)))

    await repo.updateScanJob(jobId, { status: 'tagging', foundCount: tracks.length })
    const found: Found[] = []
    for (const [n, track] of tracks.entries()) {
      const best = bestFrame(track, (i) => sharpness.get(i) ?? 1)
      let png: Buffer
      try { png = await cutout(await frameAt(best.frameIndex), best.maskPng) } catch { continue }
      const hash = createHash('sha256').update(png).digest('hex').slice(0, 20)
      const cutoutUrl = await storage.put(`${userKey(userId)}/cutouts/${hash}.png`, png, 'image/png')
      found.push({ tags: await tagWithRetry(models, cutoutUrl), cutoutUrl, photoUrl: job.frameUrls[best.frameIndex], area: best.area })
      await repo.updateScanJob(jobId, { progress: (n + 1) / tracks.length })
    }

    const kept = await dedupe(found, models)
    if (!kept.length) { await repo.updateScanJob(jobId, { status: 'failed', error: NO_CLOTHES }); return }
    await repo.insertGarments(kept.map((f): Omit<Garment, 'id'> => ({
      userId, ...f.tags, status: 'clean', wearLimitOverride: null, wearsSinceWash: 0, wearCount: 0, lastWornAt: null,
      cutoutUrl: f.cutoutUrl, photoUrl: f.photoUrl, confirmed: false,
    })))
    await repo.updateScanJob(jobId, { status: 'review', progress: 1, foundCount: kept.length })
  } catch (e) {
    console.error('scan failed', e)
    await repo.updateScanJob(jobId, { status: 'failed', error: SCAN_FAILED }).catch(() => {})
  }
}

async function tagWithRetry(models: Pick<Models, 'tagger'>, url: string): Promise<GarmentTags> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = GarmentTagsSchema.safeParse(await models.tagger.tag(url))
      if (parsed.success) return parsed.data
    } catch { /* retry once, then leave for manual tagging */ }
  }
  return UNTAGGED
}

/** Same category + subcategory + a shared color → ask the tagger; duplicates keep the larger mask. */
async function dedupe(found: Found[], models: Pick<Models, 'tagger'>): Promise<Found[]> {
  const kept: Found[] = []
  for (const f of [...found].sort((a, b) => b.area - a.area)) {
    let dup = false
    for (const k of kept) {
      const similar = k.tags.category === f.tags.category && k.tags.subcategory === f.tags.subcategory &&
        k.tags.colors.some((c) => f.tags.colors.includes(c))
      if (similar && (await models.tagger.sameItem(k.cutoutUrl, f.cutoutUrl).catch(() => false))) { dup = true; break }
    }
    if (!dup) kept.push(f)
  }
  // keep scan order for the review grid
  return found.filter((f) => kept.includes(f))
}
