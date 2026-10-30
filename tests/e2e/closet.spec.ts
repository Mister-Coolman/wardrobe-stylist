import { expect, test } from '@playwright/test'
import { seedCloset, signIn } from './helpers'

test('a piece keeps the brand, fit and details you give it', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/closet')
  await page.getByRole('button', { name: /Selvedge jeans/ }).click()
  await page.getByLabel('Brand').fill('Levi’s')
  await page.getByRole('button', { name: 'Relaxed' }).click()
  await page.getByLabel('Details').fill('raw denim, button fly')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.reload()
  await page.getByRole('button', { name: /Selvedge jeans/ }).click()
  await expect(page.getByLabel('Brand')).toHaveValue('Levi’s')
  await expect(page.getByRole('button', { name: 'Relaxed' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Details')).toHaveValue('raw denim, button fly')

  // tapping the chosen fit again clears it
  await page.getByRole('button', { name: 'Relaxed' }).click()
  await expect(page.getByRole('button', { name: 'Relaxed' })).toHaveAttribute('aria-pressed', 'false')
})
