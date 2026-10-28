import { expect, test } from '@playwright/test'
import { seedCloset, signIn } from './helpers'

test('typing "drinks after work" into the stylist plans a look', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/closet')
  await page.getByRole('button', { name: 'Talk to your stylist' }).click()
  const sheet = page.getByRole('dialog', { name: 'Your stylist' })
  await sheet.getByLabel('Message').fill('drinks after work')
  await sheet.getByRole('button', { name: 'Send' }).click()
  await expect(sheet.getByRole('link', { name: 'See the look' })).toBeVisible({ timeout: 30_000 })
  await sheet.getByRole('link', { name: 'See the look' }).click()
  await expect(page).toHaveURL(/\/today/)
  await expect(page.getByTestId('day-strip')).toContainText('drinks after work (added)', { timeout: 30_000 })
})
