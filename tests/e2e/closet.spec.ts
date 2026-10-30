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

test('add a piece from the web: search, pick a listing, review, add', async ({ page }) => {
  await signIn(page)
  await page.goto('/closet')
  await page.getByRole('link', { name: 'Add from the web' }).click()
  await expect(page.getByRole('tab', { name: 'Online' })).toHaveAttribute('aria-selected', 'true')
  await page.getByLabel('Search stores').fill('black under armour sweatpants')
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('button', { name: /UA Rival Fleece Joggers, Under Armour, \$55\.00/ }).click()

  await expect(page.getByRole('heading', { name: 'Found 1 piece' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /Under Armour UA Rival Fleece Joggers/ }).click()
  await expect(page.getByLabel('Brand')).toHaveValue('Under Armour')
  await expect(page.getByLabel('Category')).toHaveValue('bottom')
  await page.getByRole('button', { name: 'Keep piece' }).click()
  await page.getByRole('button', { name: 'Go to closet' }).click()
  await expect(page.getByText('1 piece')).toBeVisible()
})

test('find an existing piece online: fills its details, and can take the store photo', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/closet')
  await page.getByRole('button', { name: /Selvedge jeans/ }).click()
  const before = await page.getByRole('dialog').locator('img').first().getAttribute('src')
  await page.getByRole('button', { name: 'Find this online' }).click()
  await expect(page.getByLabel('Search stores')).toHaveValue('Selvedge jeans')
  await page.getByLabel('Search stores').fill("levi's 511")
  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('button', { name: /Levi's 511 Slim Fit/ }).click()
  await expect(page.getByLabel('Name')).toHaveValue("Levi's 511 Slim Fit Jeans")
  await expect(page.getByLabel('Brand')).toHaveValue("Levi's")
  await expect(page.getByRole('button', { name: 'Slim' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Details')).toHaveValue('denim')

  await page.getByRole('button', { name: 'Use the store’s photo' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Photo replaced' })).toBeVisible({ timeout: 30_000 })
  expect(await page.getByRole('dialog').locator('img').first().getAttribute('src')).not.toBe(before)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.reload()
  await expect(page.getByRole('button', { name: /Levi's 511 Slim Fit Jeans/ })).toBeVisible()
})
