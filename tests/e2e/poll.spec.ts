import { expect, test } from '@playwright/test'
import { seedCloset, signIn } from './helpers'

test('ask friends: public poll page votes once, owner sees the result and can switch', async ({ page, browser }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/today')
  await expect(page.getByRole('list', { name: 'Pieces' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Ask friends which look' }).click()
  const link = page.getByTestId('poll-link')
  await expect(link).toBeVisible({ timeout: 30_000 })
  const url = await link.textContent()
  expect(url).toMatch(/\/p\/[\w-]{8}$/)

  const friend = await browser.newContext()
  const fp = await friend.newPage()
  await fp.goto(new URL(url!).pathname)
  await expect(fp.getByRole('heading', { name: 'Which look?' })).toBeVisible()
  const votes = fp.getByRole('button', { name: /^Vote for Look/ })
  await expect(votes).toHaveCount(2)
  await votes.nth(0).click()   // Look 01 — not the one on screen, so the owner can switch to it
  await expect(fp.getByText('Thanks — your vote is in.')).toBeVisible()
  await fp.reload()
  await expect(fp.getByText('You’ve voted.')).toBeVisible()
  await friend.close()

  await page.reload()
  await expect(page.getByText(/Friends picked Look 0\d, 1–0/)).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /Wear Look 0\d/ }).click()
  await expect(page.getByRole('list', { name: 'Fitting notes' })).toContainText('Friends picked this, 1–0', { timeout: 30_000 })
})
