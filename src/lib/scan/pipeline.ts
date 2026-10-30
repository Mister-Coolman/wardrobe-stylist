import { createHash } from 'node:crypto'
import type { Garment, ScanJob } from '@/lib/domain/types'
import type { Repo } from '@/lib/db/repo'
import type { FrameMask, GarmentTags, ListingDetails, Models } from '@/lib/models/types'
import { GarmentTagsSchema } from '@/lib/models/schemas'
import type { StorageLike } from '@/lib/storage'
import { userKey } from '@/lib/storage'
import { bestFrame, colorDistance, cutout, cutoutColor, sharpnessUnder, type RGB } from './cutout'

export const NO_CLOTHES = 'No clothes found — try holding each piece up to the camera.'
export const SCAN_FAILED = 'The scan stopped partway — try again, or take a single photo.'

const UNTAGGED: GarmentTags = { name: 'Untagged piece', category: 'top', subcategory: 'other', colors: [], pattern: 'solid', formality: 2, warmth: 2, rainSafe: true, tags: [], brand: null, fit: null }

const TAG_CONCURRENCY = 4

/** first, last: when the piece was first and last seen, in seconds into the video */
/** seen: frames the piece was found in; quality: its best frame's area × sharpness, as bestFrame ranks them */
interface Found { tags: GarmentTags; cutoutUrl: string; photoUrl: string; seen: number; quality: number; color: RGB; first: number; last: number }

/** Cutouts further apart than this in mean color are different pieces; nearer ones go to the tagger to decide. */
const DEDUPE_MAX_COLOR = 45
/** In a video, pieces are shown one after another. A piece picked up again within this many seconds of the last one
 *  (a tracking break, a blurred frame while it's hung) may be the same and is always checked; after a longer stretch
 *  it's the next piece, however alike. A piece seen in a single frame was caught moving, so it gets a wider window.
 *  Measured on a hold-up clip: 4 s of empty door between two green polos; a black polo caught once while being hung,
 *  2.3 s before it hung still (docs/notes/sam-check.md). */
const DEDUPE_MAX_GAP_S = 1.5
const DEDUPE_MAX_GAP_ONCE_S = 3

/** segment → best frame → cutout → tag → dedupe → insert unconfirmed. Never throws; failures land on the job.
 *  listing: the photo came from a store listing, so keep the one piece it sells, named from the listing. */
export async function runScan(jobId: string, deps: { userId: string; models: Pick<Models, 'segmenter' | 'tagger'>; repo: Repo; storage: StorageLike; listing?: ListingDetails }): Promise<void> {
  const { repo, storage, models, userId, listing } = deps
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
    for (const [t, best] of bests.entries()) {
      const seen = tracks[t].masks.map((m) => frameSeconds(job.frameUrls[m.frameIndex], m.frameIndex))
      let png: Buffer
      try { png = await cutout(await frameAt(best.frameIndex), best.maskPng, { minus: hangers.get(best.frameIndex) }) } catch { continue }
      const hash = createHash('sha256').update(png).digest('hex').slice(0, 20)
      const cutoutUrl = await storage.put(`${userKey(userId)}/cutouts/${hash}.png`, png, 'image/png')
      cut.push({ cutoutUrl, photoUrl: job.frameUrls[best.frameIndex], seen: seen.length, quality: best.area * (sharpness.get(best) ?? 1), color: await cutoutColor(png), first: Math.min(...seen), last: Math.max(...seen) })
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

    const deduped = await dedupe(found, models)
    const kept = listing ? listedPiece(deduped, listing) : deduped
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

/** A store photo often shows a model in a whole outfit: keep the largest piece of the listed category (or the largest
 *  piece), and take its name, brand and fit from the listing; colour, warmth and dress code still come from the photo.
 *  Measured on three on-model listings (joggers, polo, quarter-zip): the right piece each time. */
export function listedPiece<F extends { tags: GarmentTags; quality: number }>(found: F[], listing: ListingDetails): F[] {
  const byQuality = [...found].sort((a, b) => b.quality - a.quality)
  const best = byQuality.find((f) => f.tags.category === listing.category) ?? byQuality[0]
  if (!best) return []
  // listings rarely name the colour; the photo shows it
  const colour = best.tags.colors[0]
  const name = listing.colors.length || !colour ? listing.name : `${colour[0].toUpperCase()}${colour.slice(1)} ${listing.name}`
  return [{ ...best, tags: { ...best.tags, name, category: listing.category, brand: listing.brand ?? best.tags.brand,
    fit: listing.fit ?? best.tags.fit, tags: [...new Set([...listing.tags, ...best.tags.tags])] } }]
}

/** One photo → the cutout of its largest piece, stored; null when nothing is found. For replacing a piece's photo. */
export async function cutoutFromPhoto(frameUrl: string, deps: { userId: string; models: Pick<Models, 'segmenter'>; storage: StorageLike }): Promise<string | null> {
  const { models, storage, userId } = deps
  const masks = (await models.segmenter.segment([frameUrl])).flatMap((t) => t.masks)
  const largest = masks.sort((a, b) => b.area - a.area)[0]
  if (!largest) return null
  const hangers = await models.segmenter.hangers?.(frameUrl).catch(() => []) ?? []
  const png = await cutout(await storage.read(frameUrl), largest.maskPng, { minus: hangers })
  const hash = createHash('sha256').update(png).digest('hex').slice(0, 20)
  return storage.put(`${userKey(userId)}/cutouts/${hash}.png`, png, 'image/png')
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
/** Seen in the same frames (a photo, or two masks of one piece): compare when category and color are close.
 *  Seen one after the other: compare only when the second follows the first closely, whatever its color. */
function mightBeSame(a: Found, b: Found): boolean {
  if (a.first <= b.last && b.first <= a.last) return a.tags.category === b.tags.category && colorDistance(a.color, b.color) <= DEDUPE_MAX_COLOR
  const gap = Math.max(a.first, b.first) - Math.min(a.last, b.last)
  return gap <= (a.seen === 1 || b.seen === 1 ? DEDUPE_MAX_GAP_ONCE_S : DEDUPE_MAX_GAP_S)
}

/** A frame's time in the video, from the name the scan route stores it under (…-2500ms.jpg); otherwise a frame a second. */
export function frameSeconds(url: string, index: number): number {
  const m = url.match(/-(\d+)ms\.jpg$/)
  return m ? Number(m[1]) / 1000 : index
}

async function dedupe(found: Found[], models: Pick<Models, 'tagger'>): Promise<Found[]> {
  const kept: Found[] = []
  // the view held longest wins, then the clearest. Measured: a red polo caught blurred and half in frame while being hung
  // covered more of the frame than the polo hanging still, and plain fabric scores about as sharp blurred as not.
  for (const f of [...found].sort((a, b) => b.seen - a.seen || b.quality - a.quality)) {
    const candidates = kept.filter((k) => mightBeSame(k, f))
    const same = await Promise.all(candidates.map((k) => models.tagger.sameItem(k.cutoutUrl, f.cutoutUrl).catch(() => false)))
    if (!same.some(Boolean)) kept.push(f)
  }
  // keep scan order for the review grid
  return found.filter((f) => kept.includes(f))
}
