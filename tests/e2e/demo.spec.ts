import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

// Spec §9 demo, end to end in mock mode: scan → Today with a self-correction → "anything else?" → trip → gap card.
test('demo script', async ({ page }) => {
  test.setTimeout(120_000)
  await signIn(page)

  // 0:20 closet scan
  await page.goto('/scan')
  await page.getByRole('tab', { name: 'Photo' }).click()
  await page.getByLabel('Closet photo').setInputFiles('tests/fixtures/closet.jpg')
  await expect(page.getByRole('heading', { name: /Found 6 pieces/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Add 6 pieces' }).click()
  await expect(page).toHaveURL(/\/closet/)

  // 0:50 Today on a rainy day: suede loafers swapped out
  await page.goto('/today')
  await expect(page.getByRole('list', { name: 'Pieces' })).toBeVisible({ timeout: 30_000 })
  const notes = page.getByRole('list', { name: 'Fitting notes' })
  await expect(notes.getByText('↺')).toBeVisible()
  await expect(notes).toContainText(/loafers/i)

  // 1:30 "anything else today?"
  await page.getByRole('button', { name: 'Drinks' }).click()
  await expect(page.getByTestId('day-strip')).toContainText('Drinks (added)', { timeout: 30_000 })

  // 2:30 gap card
  await expect(page.getByRole('region', { name: 'Closet gap' })).toContainText(/new outfits? possible/, { timeout: 30_000 })

  // 2:00 trip packing with wear limits
  await page.goto('/trips')
  await page.getByLabel('Where to').fill('Chicago')
  await page.getByLabel('From').fill('2026-11-05')
  await page.getByLabel('Until').fill('2026-11-08')
  await page.getByRole('button', { name: 'Pack for Chicago' }).click()
  await expect(page.getByRole('heading', { name: 'Chicago' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('list', { name: 'Days' }).getByRole('listitem')).toHaveCount(4)
  await expect(page.getByRole('list', { name: 'Packing list' })).toContainText(/limit \d/)
})
