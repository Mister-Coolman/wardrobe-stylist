import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('signed-out visit to /today redirects to /onboarding', async ({ page }) => {
  await page.context().clearCookies()
  await page.goto('/today')
  await expect(page).toHaveURL(/\/onboarding/)
})

test('signed in, /today shows the 4-item nav with Today current', async ({ page }) => {
  await signIn(page)
  await page.goto('/today')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link')).toHaveCount(4)
  await expect(nav.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Closet' })).not.toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Talk to your stylist' })).toBeVisible()
})
