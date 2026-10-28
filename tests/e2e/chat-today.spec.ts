import { expect, test } from '@playwright/test'
import { seedCloset, signIn } from './helpers'

test('#4 chat started on Today updates the look on screen', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: /Look 01 —/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Talk to your stylist' }).click()
  const sheet = page.getByRole('dialog', { name: 'Your stylist' })
  await sheet.getByLabel('Message').fill('drinks after work')
  await sheet.getByRole('button', { name: 'Send' }).click()
  await sheet.getByRole('link', { name: 'See the look' }).click()
  await expect(page.getByRole('heading', { name: /Look 02 —/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('day-strip')).toContainText('drinks after work (added)')
})

test('#6 a logged look still says Logged after a reload', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/today')
  await page.getByRole('button', { name: 'I wore this' }).click({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Logged/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /Logged/ })).toBeVisible({ timeout: 30_000 })
})
