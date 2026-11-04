// Lays out the recorded app shots (phone screen on the left, caption on the right) and the cards, at 30 fps, and encodes
// every shot to out/NN-name.webm plus the whole sequence to out/rough-cut.webm (VP9). Uses Playwright's bundled ffmpeg.
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
const sharp = createRequire(import.meta.url)('sharp')

const here = new URL('./', import.meta.url).pathname
const cards = `${here}out/cards/`, work = `${here}work/`, out = `${here}out/`
const cache = `${homedir()}/Library/Caches/ms-playwright/`
const FFMPEG = `${cache}${readdirSync(cache).find((d) => d.startsWith('ffmpeg'))}/ffmpeg-mac`
const FPS = 30, W = 1920, H = 1080

const SHOTS = [
  { name: 'title', card: 'title', s: 6 },
  { name: 'problem', card: 'problem', s: 9 },
  { name: 'phone-clip-A', card: 'slateA', s: 3 },
  { name: 'today', app: 'today' },
  { name: 'stylist', app: 'stylist' },
  { name: 'phone-clip-B', card: 'slateB', s: 3 },
  { name: 'trip', app: 'trip' },
  { name: 'how', card: 'how', s: 12 },
  { name: 'end', card: 'end', s: 7 },
]

// this ffmpeg has no pipe protocol, so frames go through a named pipe it reads as a file
let pipes = 0
const encoder = (file) => {
  const fifo = `${work}frames-${pipes++}.fifo`
  rmSync(fifo, { force: true }); execFileSync('mkfifo', [fifo])
  const p = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', fifo,
    '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-b:v', '5M', '-pix_fmt', 'yuv420p', file], { stdio: ['ignore', 'inherit', 'inherit'] })
  const done = new Promise((ok, no) => p.on('close', (c) => (c ? no(new Error(`ffmpeg ${c}`)) : ok())))
  const sink = createWriteStream(fifo)
  const write = (buf) => new Promise((ok) => (sink.write(buf) ? ok() : sink.once('drain', ok)))
  return { write, end: async () => { await new Promise((ok) => sink.end(ok)); await done; rmSync(fifo, { force: true }) } }
}

// the phone: screen scaled to 980 px tall, rounded, on a dark bezel with a soft shadow
const SCREEN_H = 960, SCREEN_W = Math.round(SCREEN_H * 860 / 1864), BEZEL = 14, R = 44
const PX = 330, PY = Math.round((H - SCREEN_H - 2 * BEZEL) / 2)
const mask = Buffer.from(`<svg width="${SCREEN_W}" height="${SCREEN_H}"><rect width="100%" height="100%" rx="${R - BEZEL}" fill="#fff"/></svg>`)
const stage = await sharp({ create: { width: W, height: H, channels: 3, background: '#F4F1EA' } }).composite([
  { input: await sharp(Buffer.from(`<svg width="${SCREEN_W + 2 * BEZEL + 80}" height="${SCREEN_H + 2 * BEZEL + 80}"><rect x="40" y="52" width="${SCREEN_W + 2 * BEZEL}" height="${SCREEN_H + 2 * BEZEL}" rx="${R}" fill="rgba(28,26,23,.22)"/></svg>`)).blur(18).png().toBuffer(), left: PX - 40, top: PY - 40 },
  { input: Buffer.from(`<svg width="${SCREEN_W + 2 * BEZEL}" height="${SCREEN_H + 2 * BEZEL}"><rect width="100%" height="100%" rx="${R}" fill="#1C1A17"/></svg>`), left: PX, top: PY },
]).png().toBuffer()

async function* appFrames(name) {
  const { frames, beats, end } = JSON.parse(readFileSync(`${work}${name}/frames.json`, 'utf8'))
  const caps = Object.fromEntries(await Promise.all(beats.map(async (b) => [b.cap, await readFileSync(`${cards}cap-${b.cap}.png`)])))
  const n = Math.ceil((end / 1000) * FPS)
  let i = 0, lastKey = '', lastOut = null
  for (let f = 0; f < n; f++) {
    const t = (f / FPS) * 1000
    while (i + 1 < frames.length && frames[i + 1].t <= t) i++
    const cap = [...beats].reverse().find((b) => b.t <= t)?.cap ?? beats[0]?.cap
    const key = `${frames[i].file}|${cap}`
    if (key !== lastKey) {
      const screen = await sharp(`${work}${name}/${frames[i].file}`).resize(SCREEN_W, SCREEN_H, { fit: 'cover', position: 'top' })
        .composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
      lastOut = await sharp(stage).composite([{ input: screen, left: PX + BEZEL, top: PY + BEZEL }, ...(cap ? [{ input: caps[cap] }] : [])]).jpeg({ quality: 90 }).toBuffer()
      lastKey = key
    }
    yield lastOut
  }
}
async function* cardFrames(card, s) {
  const jpg = await sharp(`${cards}${card}.png`).flatten({ background: '#F4F1EA' }).jpeg({ quality: 92 }).toBuffer()
  for (let f = 0; f < s * FPS; f++) yield jpg
}

const all = encoder(`${out}rough-cut.webm`)
let total = 0
for (const [i, shot] of SHOTS.entries()) {
  if (shot.app && !existsSync(`${work}${shot.app}/frames.json`)) { console.log('skipped', shot.name, '(not recorded)'); continue }
  const one = encoder(`${out}${String(i + 1).padStart(2, '0')}-${shot.name}.webm`)
  let n = 0
  for await (const jpg of shot.app ? appFrames(shot.app) : cardFrames(shot.card, shot.s)) { await one.write(jpg); await all.write(jpg); n++ }
  await one.end(); total += n
  console.log(shot.name, (n / FPS).toFixed(1), 's')
}
await all.end()
console.log('rough cut', (total / FPS).toFixed(1), 's')
