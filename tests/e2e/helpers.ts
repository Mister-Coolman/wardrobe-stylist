import type { Page } from '@playwright/test'
import { rmSync } from 'node:fs'

/** Fresh local store, then sign in through the dev bypass on /onboarding. */
export async function signIn(page: Page, { reset = true } = {}) {
  if (reset) { rmSync('.data/e2e-db.json', { force: true }); rmSync('.data/e2e-media', { recursive: true, force: true }) }
  await page.goto('/onboarding')
  await page.getByRole('button', { name: /continue as e2e@example.com/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'))
}
