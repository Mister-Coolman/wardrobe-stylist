// Live scan check: SAM 3.1 segmentation → cutouts → Muse Spark tags → dedupe, through the real scan pipeline.
// Pass photos, or video frames in scan order (the app samples video at 2 fps in the browser):
//   set -a; . ./.env.local; set +a; npx tsx --tsconfig tsconfig.json scripts/sam-check.mts samples/closet.jpg
// Cutouts land in SAM_OUT (default .data/sam-check/) so they can be looked at.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createLocalRepo } from '../src/lib/db/local'
import { realModels } from '../src/lib/models/real'
import { runScan } from '../src/lib/scan/pipeline'
import { getStorage } from '../src/lib/storage'

const files = process.argv.slice(2)
if (!files.length) throw new Error('usage: sam-check.mts <photo or frame>…')
const out = process.env.SAM_OUT ?? '.data/sam-check'
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

// adapters read media through the app's storage (.data/media locally, or Supabase when configured)
const storage = getStorage()
const repo = createLocalRepo(join(out, 'db.json'))
const models = realModels()
const frameUrls = await Promise.all(files.map(async (f, i) => storage.put(`check/frames/${i}-${basename(f)}`, await readFile(f), 'image/jpeg')))

const t = Date.now()
const tracks = await models.segmenter.segment(frameUrls)
console.log(`SAM: ${tracks.length} track(s) from ${files.length} frame(s) in ${((Date.now() - t) / 1000).toFixed(1)}s`)
for (const tr of tracks) console.log(`  ${tr.trackId}: frames ${tr.masks.map((m) => m.frameIndex).join(',')} · largest ${Math.max(...tr.masks.map((m) => m.area))} px`)

// the full pipeline, segmenting again so timings reflect a real scan
const job = await repo.createScanJob('check', '', frameUrls)
await runScan(job.id, { userId: 'check', models, repo, storage })
const done = await repo.getScanJob('check', job.id)
console.log(`Scan: ${done?.status}${done?.error ? ` — ${done.error}` : ''} · ${((Date.now() - t) / 1000).toFixed(1)}s total`)
for (const [i, g] of (await repo.listGarments('check')).entries()) {
  const file = join(out, `${String(i + 1).padStart(2, '0')}-${g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`)
  await writeFile(file, await storage.read(g.cutoutUrl))
  console.log(`  ${g.name} · ${g.category}/${g.subcategory} · ${g.colors.join(', ')} · formality ${g.formality} · warmth ${g.warmth}${g.rainSafe ? ' · rain-safe' : ''} → ${file}`)
}
