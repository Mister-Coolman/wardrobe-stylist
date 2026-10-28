import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('screenshots become an editable style profile', async ({ page }) => {
  await signIn(page)
  await page.goto('/settings')
  await page.getByLabel('Style screenshots').setInputFiles(['tests/fixtures/closet.jpg'])
  await expect(page.getByLabel('Palette (comma-separated)')).toHaveValue(/navy/, { timeout: 30_000 })
  await page.getByLabel('Avoid').fill('logo, neon, fleece')
  await page.getByRole('button', { name: 'Save style' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Avoid')).toHaveValue('logo, neon, fleece')
})
