import { createHash } from 'node:crypto'
import type { Garment, ScanJob } from '@/lib/domain/types'
import type { Repo } from '@/lib/db/repo'
import type { FrameMask, GarmentTags, Models } from '@/lib/models/types'
import { GarmentTagsSchema } from '@/lib/models/schemas'
import type { StorageLike } from '@/lib/storage'
import { userKey } from '@/lib/storage'
import { bestFrame, colorDistance, cutout, cutoutColor, sharpnessUnder, type RGB } from './cutout'

export const NO_CLOTHES = 'No clothes found — try holding each piece up to the camera.'
export const SCAN_FAILED = 'The scan stopped partway — try again, or take a single photo.'

const UNTAGGED: GarmentTags = { name: 'Untagged piece', category: 'top', subcategory: 'other', colors: [], pattern: 'solid', formality: 2, warmth: 2, rainSafe: true, tags: [] }

const TAG_CONCURRENCY = 4

interface Found { tags: GarmentTags; cutoutUrl: string; photoUrl: string; area: number; color: RGB }

/** Cutouts further apart than this in mean color are different pieces; nearer ones go to the tagger to decide. */
const DEDUPE_MAX_COLOR = 45

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
    const sharpness = new Map<FrameMask, number>()
    for (const m of tracks.flatMap((t) => t.masks)) sharpness.set(m, await sharpnessUnder(await frameAt(m.frameIndex), m.maskPng))

    await repo.updateScanJob(jobId, { status: 'tagging', foundCount: tracks.length })
    const bests = tracks.map((t) => bestFrame(t, (m) => sharpness.get(m) ?? 1))
    // hangers in each chosen frame, fetched together; without them the cutout just keeps its hook
    const hangers = new Map(await Promise.all([...new Set(bests.map((b) => b.frameIndex))].map(async (i) =>
      [i, await models.segmenter.hangers?.(job.frameUrls[i]).catch(() => []) ?? []] as const)))
    const cut: Omit<Found, 'tags'>[] = []
    for (const best of bests) {
      let png: Buffer
      try { png = await cutout(await frameAt(best.frameIndex), best.maskPng, { minus: hangers.get(best.frameIndex) }) } catch { continue }
      const hash = createHash('sha256').update(png).digest('hex').slice(0, 20)
      const cutoutUrl = await storage.put(`${userKey(userId)}/cutouts/${hash}.png`, png, 'image/png')
      cut.push({ cutoutUrl, photoUrl: job.frameUrls[best.frameIndex], area: best.area, color: await cutoutColor(png) })
    }
    // tag a few at a time; results keep scan order
    const found: Found[] = new Array(cut.length)
    let next = 0, done = 0
    await Promise.all(Array.from({ length: Math.min(TAG_CONCURRENCY, cut.length) }, async () => {
      while (next < cut.length) {
        const k = next++
        found[k] = { ...cut[k], tags: await tagWithRetry(models, cut[k].cutoutUrl) }
        await repo.updateScanJob(jobId, { progress: ++done / cut.length })
      }
    }))

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

/** The unconfirmed pieces this scan produced: each piece's photo is one of the job's frames. */
export function piecesFromScan(job: Pick<ScanJob, 'frameUrls'>, unconfirmed: Garment[]): Garment[] {
  const frames = new Set(job.frameUrls)
  return unconfirmed.filter((g) => frames.has(g.photoUrl))
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

/** Same category and close in color → ask the tagger (against every such piece at once); duplicates keep the larger mask.
 *  Color comes from the pixels, not the tags: one shirt can be tagged "white" in one frame and "cream" in the next. */
async function dedupe(found: Found[], models: Pick<Models, 'tagger'>): Promise<Found[]> {
  const kept: Found[] = []
  for (const f of [...found].sort((a, b) => b.area - a.area)) {
    const candidates = kept.filter((k) => k.tags.category === f.tags.category && colorDistance(k.color, f.color) <= DEDUPE_MAX_COLOR)
    const same = await Promise.all(candidates.map((k) => models.tagger.sameItem(k.cutoutUrl, f.cutoutUrl).catch(() => false)))
    if (!same.some(Boolean)) kept.push(f)
  }
  // keep scan order for the review grid
  return found.filter((f) => kept.includes(f))
}
