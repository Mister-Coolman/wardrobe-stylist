import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { getRepo } from '@/lib/db/repo'
import { withUser } from '@/lib/api'
import { getModels } from '@/lib/models'
import { runScan } from '@/lib/scan/pipeline'
import { getStorage, userKey } from '@/lib/storage'

const MAX_FRAMES = 120
// segmentation + tagging run in after(); give them room on Vercel
export const maxDuration = 300

/** multipart: frames (JPEGs sampled client-side at 2 fps, or one photo), optional video. Returns the job id at once. */
export async function POST(req: Request) {
  return withUser(async (u) => {
    const form = await req.formData()
    const frames = form.getAll('frames').filter((f): f is File => f instanceof File).slice(0, MAX_FRAMES)
    if (!frames.length) return Response.json({ error: 'no_frames' }, { status: 400 })
    const storage = getStorage()
    const scanId = randomUUID()
    const base = `${userKey(u.userId)}/scans/${scanId}`
    // the phone names each frame with its time in the video (frame-2500ms.jpg); keep it, the duplicate check works in seconds
    const frameUrls = await Promise.all(frames.map(async (f, i) => {
      const at = f.name.match(/(\d+)ms\.jpg$/)?.[1]
      return storage.put(`${base}/frame-${String(i).padStart(3, '0')}${at ? `-${at}ms` : ''}.jpg`, Buffer.from(await f.arrayBuffer()), f.type || 'image/jpeg')
    }))
    const video = form.get('video')
    const mediaUrl = video instanceof File ? await storage.put(`${base}/video.webm`, Buffer.from(await video.arrayBuffer()), video.type || 'video/webm') : frameUrls[0]
    const repo = await getRepo()
    const job = await repo.createScanJob(u.userId, mediaUrl, frameUrls)
    after(() => runScan(job.id, { userId: u.userId, models: getModels(), repo, storage }))
    return Response.json({ id: job.id })
  })
}
