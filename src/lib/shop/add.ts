import { randomUUID } from 'node:crypto'
import type { Repo } from '@/lib/db/repo'
import type { ScanJob } from '@/lib/domain/types'
import type { Models } from '@/lib/models/types'
import { runScan } from '@/lib/scan/pipeline'
import type { StorageLike } from '@/lib/storage'
import { userKey } from '@/lib/storage'
import { fetchProductImage } from './image'
import type { Product } from './search'

/** A listing's photo as a one-frame scan job; `run` cuts out and tags the listed piece (unconfirmed). Null when the photo can't be fetched. */
export async function startListing(userId: string, p: Pick<Product, 'imageUrl' | 'title'>, deps: { repo: Repo; models: Models; storage: StorageLike }): Promise<{ job: ScanJob; run: () => Promise<void> } | null> {
  const { repo, models, storage } = deps
  const image = await fetchProductImage(p.imageUrl, storage).catch(() => null)
  if (!image) return null
  const frameUrl = await storage.put(`${userKey(userId)}/scans/${randomUUID()}/frame-000.jpg`, image, 'image/jpeg')
  const job = await repo.createScanJob(userId, frameUrl, [frameUrl])
  return { job, run: async () => {
    const listing = await models.tagger.fromListing(p.title).catch(() => undefined)
    await runScan(job.id, { userId, models, repo, storage, listing })
  } }
}
