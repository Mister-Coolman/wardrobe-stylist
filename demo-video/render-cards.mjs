// Renders every card and caption in cards.html to a 1920x1080 PNG (captions transparent).
import { chromium } from '@playwright/test'
const out = new URL('./out/cards/', import.meta.url).pathname
const page = await (await chromium.launch()).newPage({ viewport: { width: 1920, height: 1080 } })
const url = new URL('./cards.html', import.meta.url).href
await page.goto(url)
const { cards, caps } = await page.evaluate(() => window.IDS)
for (const id of [...cards, ...caps]) {
  await page.goto(`${url}#${id}`); await page.reload()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `${out}${caps.includes(id) ? 'cap-' : ''}${id}.png`, omitBackground: caps.includes(id) })
}
console.log('rendered', cards.length + caps.length)
process.exit(0)
