import { expect, test } from '@playwright/test'
import { seedCloset, signIn } from './helpers'

test('rainy day: look with a revision note, add an event, log the wear', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/today')

  await expect(page.getByRole('heading', { name: /Look 01 —/ })).toBeVisible({ timeout: 30_000 })
  // calendar isn't connected in e2e: the look still comes, and the strip says so
  await expect(page.getByText('Calendar not connected')).toBeVisible()
  await expect(page.getByText('Rain from 17:00')).toBeVisible()
  const notes = page.getByRole('list', { name: 'Fitting notes' })
  await expect(notes.getByText('↺')).toBeVisible()
  await expect(notes).toContainText(/loafers/i)

  await page.getByRole('button', { name: 'Drinks' }).click()
  await expect(page.getByTestId('day-strip')).toContainText('Drinks (added)', { timeout: 30_000 })

  const pieces = await page.getByRole('list', { name: 'Pieces' }).getByRole('listitem').allTextContents()
  expect(pieces.length).toBeGreaterThanOrEqual(3)
  await page.getByRole('button', { name: 'I wore this' }).click()
  await expect(page.getByRole('button', { name: /Logged/ })).toBeVisible()

  await page.goto('/closet')
  await expect(page.getByText(/Worn 1/).first()).toBeVisible()
})

test('empty closet → missing pieces message with a scan link', async ({ page }) => {
  await signIn(page)
  await page.goto('/today')
  await expect(page.getByText('Your closet is empty. Scan it in a minute.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: 'Scan closet' })).toBeVisible()
})

test('Another look shows a different outfit', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: /Look 01 —/ })).toBeVisible({ timeout: 30_000 })
  const first = await page.getByRole('list', { name: 'Pieces' }).textContent()
  await page.getByRole('button', { name: 'Another look' }).click()
  await expect(page.getByRole('heading', { name: /Look 02 —/ })).toBeVisible({ timeout: 30_000 })
  expect(await page.getByRole('list', { name: 'Pieces' }).textContent()).not.toBe(first)
})
