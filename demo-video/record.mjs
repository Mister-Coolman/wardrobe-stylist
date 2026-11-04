// Records the app walkthrough on a phone-sized screen, as JPEG frames with the time each was shown, into work/<shot>/.
// Waits for the models are cut out: recording pauses while a look is planned or drawn, so the clip jumps to the result.
// Run against a server with real models and a demo closet: BASE=http://localhost:3300 node demo-video/record.mjs
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:3300'
const work = new URL('./work/', import.meta.url).pathname
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)

let shot = null, rec = false, clock = 0, last = 0, frames = [], beats = []
cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  if (!shot || !rec) return
  const now = Date.now(); clock += last ? now - last : 0; last = now
  const file = `${String(frames.length).padStart(5, '0')}.jpg`
  writeFileSync(`${work}${shot}/${file}`, Buffer.from(data, 'base64'))
  frames.push({ file, t: clock })
})
const start = async (name) => {
  shot = name; frames = []; beats = []; clock = 0; last = 0
  rmSync(`${work}${name}`, { recursive: true, force: true }); mkdirSync(`${work}${name}`, { recursive: true })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 860, maxHeight: 1864, everyNthFrame: 1 })
  resume()
}
const pause = () => { rec = false }
const resume = () => { rec = true; last = Date.now() }
const beat = (cap) => beats.push({ t: clock + (last ? Date.now() - last : 0), cap })
const hold = (ms) => page.waitForTimeout(ms)
const stop = async () => {
  await hold(300); await cdp.send('Page.stopScreencast')
  writeFileSync(`${work}${shot}/frames.json`, JSON.stringify({ frames, beats, end: clock }))
  console.log(shot, frames.length, 'frames', (clock / 1000).toFixed(1), 's')
  shot = null; rec = false
}
/** A slow scroll, so it reads on video */
const scroll = async (px, ms = 1600) => {
  const steps = Math.max(1, Math.round(ms / 40))
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, px / steps); await hold(40) }
}
const type = async (text) => {
  const box = page.getByRole('textbox', { name: 'Message' })
  await box.click(); await box.pressSequentially(text, { delay: 45 })
  await hold(400); await page.getByRole('button', { name: 'Send' }).click()
}
const drawn = (loc) => loc.locator('img[src*="/renders/"]').last().waitFor({ state: 'visible', timeout: 150_000 })

// sign in as a fresh demo user with a copy of the owner's closet
await page.goto(`${BASE}/onboarding`)
await page.getByRole('button', { name: /Try the demo/ }).click()
await page.waitForURL(/\/today/, { timeout: 90_000, waitUntil: 'commit' })

// ── Today
await page.mouse.move(215, 300)
await start('today')
pause()
await page.getByRole('list', { name: 'Pieces' }).waitFor({ timeout: 150_000 })
await drawn(page.locator('main')).catch(() => {})
await hold(800); resume()
beat('today'); await hold(2500)
await scroll(500, 2200); await hold(2000)
await scroll(500, 2200); await hold(1500)
beat('notes')
const notes = page.getByRole('list', { name: 'Fitting notes' })
await notes.scrollIntoViewIfNeeded().catch(() => {}); await hold(3500)
await scroll(400, 1800); await hold(2000)
await stop()

// ── Stylist
await page.goto(`${BASE}/stylist`)
await page.getByRole('textbox', { name: 'Message' }).waitFor()
await start('stylist')
beat('ask'); await hold(1200)
await type('Something for drinks after work tonight')
await hold(1500); pause()
const looks = page.getByRole('group', { name: /^Look:/ })
await looks.last().waitFor({ timeout: 150_000 })
await drawn(looks.last()).catch(() => {})
await hold(600); resume()
await looks.last().scrollIntoViewIfNeeded(); await hold(4000)
await scroll(300, 1400); await hold(2500)
beat('laundry')
await type('I spilled coffee on the white dress shirt')
await hold(1500); pause()
await page.waitForFunction(() => document.querySelectorAll('[aria-label="Message"]').length >= 0 && /laundry/i.test(document.querySelector('main')?.innerText.split('spilled coffee').pop() ?? ''), null, { timeout: 90_000 }).catch(() => {})
await hold(500); resume()
await scroll(600, 1500); await hold(4000)
await stop()

// ── Trips
await page.goto(`${BASE}/trips`)
await page.getByLabel('Where to').waitFor()
await start('trip')
beat('trip'); await hold(1000)
await page.getByLabel('Where to').pressSequentially('Chicago', { delay: 60 })
await page.getByLabel('From').fill('2026-11-06'); await hold(300)
await page.getByLabel('Until').fill('2026-11-09'); await hold(800)
await page.getByRole('button', { name: /Pack for Chicago/ }).click()
await hold(1200); pause()
await page.getByRole('heading', { name: 'Chicago' }).waitFor({ timeout: 480_000 })
await hold(800); resume()
await hold(3000)
await scroll(700, 2500); await hold(2500)
await scroll(700, 2500); await hold(2500)
const list = page.getByRole('list', { name: 'Packing list' })
await list.scrollIntoViewIfNeeded().catch(() => {}); await hold(4000)
await stop()

console.log('demo user cookie kept in this browser only; done')
await browser.close()
