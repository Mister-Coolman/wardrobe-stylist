import { expect, test } from '@playwright/test'
import { seedCloset, signIn } from './helpers'

test('plan a 3-day Chicago trip; packing checks survive a reload', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/trips')
  await expect(page.getByText('No trips yet.')).toBeVisible()
  await page.getByLabel('Where to').fill('Chicago')
  await page.getByLabel('From').fill('2026-11-05')
  await page.getByLabel('Until').fill('2026-11-07')
  await page.getByRole('button', { name: 'Pack for Chicago' }).click()

  await expect(page).toHaveURL(/\/trips\/[\w-]+$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Chicago' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Days' }).getByRole('listitem')).toHaveCount(3)
  const packing = page.getByRole('list', { name: 'Packing list' })
  const first = packing.getByRole('checkbox').first()
  await expect(first).not.toBeChecked()
  await first.check()
  await page.reload()
  await expect(page.getByRole('list', { name: 'Packing list' }).getByRole('checkbox').first()).toBeChecked()

  await page.goto('/trips')
  await expect(page.getByRole('link', { name: /Chicago/ })).toBeVisible()
})
