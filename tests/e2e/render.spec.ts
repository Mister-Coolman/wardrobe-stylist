import { expect, test } from '@playwright/test'
import { seedCloset, signIn } from './helpers'

test('switching to Pieces shows the cutout grid without a render call', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/today')
  await expect(page.getByRole('img', { name: 'The look, laid flat' })).toBeVisible({ timeout: 30_000 })
  const renders: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/render')) renders.push(r.url()) })
  await page.getByRole('radio', { name: 'Pieces' }).click()
  await expect(page.getByRole('list', { name: 'The look, piece by piece' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Pieces' })).toBeChecked()
  expect(renders).toEqual([])
})

test('a failed render shows the error copy and the pieces', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: /Look 01/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('radio', { name: 'Pieces' }).click()
  await page.context().addCookies([{ name: 'mock_render_fail', value: '1', url: 'http://localhost:3100' }])
  await page.getByRole('radio', { name: 'Flat lay' }).click()
  await expect(page.getByText('Couldn’t render the look. Showing the pieces instead.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('list', { name: 'The look, piece by piece' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('try-on without a photo falls back to flat lay with a note', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: /Look 01/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('radio', { name: 'Try-on' }).click()
  await expect(page.getByText('Add a photo of you in Settings for try-on.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('img', { name: 'The look, laid flat' })).toBeVisible()
})

test('On a mannequin shows the mannequin render', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/today')
  await expect(page.getByRole('heading', { name: /Look 01/ })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('radio', { name: 'On a mannequin' }).click()
  await expect(page.getByRole('img', { name: 'The look, on a mannequin' })).toBeVisible({ timeout: 30_000 })
})
