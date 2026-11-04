// Draws the same looks a few times with the live renderer and counts what's wrong with each picture, so a change to the
// picture prompt is measured, not guessed. Costs Meta calls: every run draws each look once or twice and checks it.
//   set -a; . ./.env.local; set +a; MODELS=real npx tsx --tsconfig tsconfig.json scripts/render-bench.mts [label] [runs]
// BENCH_USER=<user id> draws that user's five newest looks (read-only); otherwise three looks from the sample closet.
// Pictures go to .data/render-bench/<label>/, nothing is saved to the app.
import { mkdirSync, writeFileSync } from 'node:fs'
import { getRepo } from '../src/lib/db/repo'
import type { Garment } from '../src/lib/domain/types'
import { addDays, localDate } from '../src/lib/domain/dates'
import { sampleCloset } from '../src/lib/fixtures/sampleCloset'
import { colour, realRenderer } from '../src/lib/models/real/renderer'
import { contentProblems, framingProblem } from '../src/lib/models/real/renderCheck'
import type { RenderPiece } from '../src/lib/models/types'

const label = process.argv[2] ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const runs = Number(process.argv[3] ?? 2)
const out = `.data/render-bench/${label}/`
mkdirSync(out, { recursive: true })

async function looks(): Promise<{ id: string; mode: 'flatlay' | 'mannequin'; pieces: RenderPiece[] }[]> {
  const user = process.env.BENCH_USER
  const piece = (g: Garment): RenderPiece => ({ cutoutUrl: g.cutoutUrl, name: g.name, category: g.category, subcategory: g.subcategory, colors: g.colors, tags: g.tags, brand: g.brand, fit: g.fit })
  if (!user) {
    const closet = sampleCloset('bench')
    const named = (...names: string[]) => names.map((n) => piece(closet.find((g) => g.name.startsWith(n))!))
    return [
      { id: 'sample-1', mode: 'flatlay', pieces: named('Oat merino', 'Selvedge jeans', 'Brown suede') },
      { id: 'sample-2', mode: 'flatlay', pieces: named('Navy wool overcoat', 'Charcoal wool', 'Black leather') },
      { id: 'sample-3', mode: 'mannequin', pieces: named('Oat merino', 'Charcoal wool', 'Black leather') },
    ]
  }
  const repo = await getRepo()
  const closet = await repo.listGarments(user)
  const seen = new Set<string>(), found: { id: string; mode: 'flatlay' | 'mannequin'; pieces: RenderPiece[] }[] = []
  for (let d = 0, date = localDate('UTC'); d < 30 && found.length < 5; d++, date = addDays(date, -1)) {
    for (const o of (await repo.listOutfitsFor(user, date)).reverse()) {
      const key = [...o.garmentIds].sort().join()
      const pieces = o.garmentIds.map((id) => closet.find((g) => g.id === id)).filter((g): g is Garment => !!g)
      if (seen.has(key) || pieces.length !== o.garmentIds.length || found.length >= 5) continue
      seen.add(key)
      found.push({ id: `${date}-${o.id.slice(0, 6)}`, mode: o.renderMode === 'mannequin' ? 'mannequin' : 'flatlay', pieces: pieces.map(piece) })
    }
  }
  return found
}

const all = await looks()
const tally = { pictures: 0, cropped: 0, pieces: 0, colour: 0, extra: 0, lettering: 0, seconds: 0 }
await Promise.all(all.flatMap((look) => Array.from({ length: runs }, async (_, r) => {
  const t = Date.now()
  try {
    const { url } = await realRenderer.render({ mode: look.mode, pieces: look.pieces })
    const seconds = (Date.now() - t) / 1000
    const jpg = Buffer.from(url.split(',')[1], 'base64')
    writeFileSync(`${out}${look.id}-${r + 1}.jpg`, jpg)
    const problems = [await framingProblem(jpg, look.mode === 'flatlay'), ...await contentProblems(url, look.pieces, colour).catch(() => ['check failed'])].filter((p): p is string => !!p)
    tally.pictures++; tally.seconds += seconds
    for (const p of problems) {
      if (p.startsWith('cut off')) tally.cropped++
      else if (/missing|twice/.test(p)) tally.pieces++
      else if (/colour/.test(p)) tally.colour++
      else if (/extra/.test(p)) tally.extra++
      else if (/lettering/.test(p)) tally.lettering++
    }
    console.log(`${look.id} #${r + 1}  ${seconds.toFixed(0)}s  ${problems.length ? problems.join('; ') : 'ok'}`)
  } catch (e) { console.log(`${look.id} #${r + 1}  FAILED ${(e as Error).message.slice(0, 120)}`) }
})))
const n = tally.pictures || 1
console.log(`\n${label}: ${tally.pictures} pictures, ${(tally.seconds / n).toFixed(0)}s each on average`)
console.log(`  cut off ${tally.cropped} · piece missing or doubled ${tally.pieces} · wrong colour ${tally.colour} · extra garment ${tally.extra} · label lettering ${tally.lettering}`)
console.log(`  pictures in ${out}`)
