import { expect, test } from '@playwright/test'
import { seedCloset, signIn } from './helpers'

test('try the demo: no account, a copy of the owner’s closet, the sample calendar sets the day', async ({ page }) => {
  await signIn(page)          // e2e@example.com is DEMO_SOURCE_USER here
  await seedCloset(page)
  await page.request.post('/api/sign-out', { maxRedirects: 0 })

  await page.goto('/onboarding')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page).toHaveURL(/\/today/)
  await expect(page.getByText(/Demo · a copy of a real closet/)).toBeVisible()
  await expect(page.getByTestId('day-strip')).toContainText('Client lunch', { timeout: 30_000 })
  await expect(page.getByText('Calendar not connected')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Pieces' })).toBeVisible({ timeout: 30_000 })

  await page.goto('/settings')
  await expect(page.getByText('Text your stylist on WhatsApp')).toHaveCount(0)
  expect((await page.request.post('/api/whatsapp/link')).status()).toBe(403)
})
