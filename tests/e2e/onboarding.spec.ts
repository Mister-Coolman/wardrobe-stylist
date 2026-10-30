import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('new user: onboarding with Brooklyn, skipping optional steps, lands on /scan', async ({ page }) => {
  await signIn(page, { onboard: false })
  await expect(page).toHaveURL(/\/onboarding\/setup/)
  await page.goto('/today')
  await expect(page).toHaveURL(/\/onboarding\/setup/)

  await page.getByLabel('Home city').fill('Brooklyn')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await page.getByRole('button', { name: 'Skip for now' }).click()       // photo
  await expect(page.getByRole('radio', { name: 'Flat lay' })).toBeChecked()
  await page.getByRole('button', { name: 'Next', exact: true }).click()               // render mode
  await page.getByRole('button', { name: 'Use these' }).click()          // rewear limits
  await expect(page).toHaveURL(/\/scan/)
})

test('settings show defaults and persist a rewear limit', async ({ page }) => {
  await signIn(page)
  await page.goto('/today')
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings/)
  await expect(page.getByRole('radio', { name: 'Flat lay' })).toBeChecked()
  await expect(page.getByLabel('Jeans')).toHaveValue('5')
  await expect(page.getByLabel('Home city')).toHaveValue('Brooklyn')
  await page.getByLabel('Jeans').fill('3')
  await page.getByRole('button', { name: 'Save rewear limits' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Jeans')).toHaveValue('3')
})

test('temperatures show in °F for a US home by default, and switch to °C in settings', async ({ page }) => {
  await signIn(page)
  await page.goto('/today')
  await expect(page.getByTestId('day-strip')).toContainText(/57°\s→\s48°/, { timeout: 30_000 })
  await page.goto('/settings')
  await expect(page.getByRole('radio', { name: '°F' })).toBeChecked()
  await page.getByRole('radio', { name: '°C' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved.')
  await page.goto('/today')
  await expect(page.getByTestId('day-strip')).toContainText(/14°\s→\s9°/, { timeout: 30_000 })
})
