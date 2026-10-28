import type { Page } from '@playwright/test'
import { rmSync } from 'node:fs'

/** Fresh local store, sign in through the dev bypass, and (unless `onboard: false`) save a Brooklyn profile. */
export async function signIn(page: Page, { reset = true, onboard = true } = {}) {
  if (reset) { rmSync('.data/e2e-db.json', { force: true }); rmSync('.data/e2e-media', { recursive: true, force: true }) }
  await page.goto('/onboarding')
  await page.getByRole('button', { name: /continue as e2e@example.com/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/onboarding') || u.pathname.startsWith('/onboarding/setup'))
  if (onboard) {
    const res = await page.request.patch('/api/profile', { data: { homeCity: 'Brooklyn', tz: 'America/New_York' } })
    if (!res.ok()) throw new Error(`profile failed: ${res.status()}`)
  }
}

/** Development seed: the 12-piece sample closet (suede loafers, boots, rust tee in the laundry…). */
export async function seedCloset(page: Page) {
  const res = await page.request.post('/api/dev/seed', { maxRedirects: 0 })
  if (res.status() !== 303) throw new Error(`seed failed: ${res.status()}`)
}
