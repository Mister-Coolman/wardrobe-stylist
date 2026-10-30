import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

test('photo scan → review → add → closet; delete removes a piece', async ({ page }) => {
  await signIn(page)
  await page.goto('/closet')
  await expect(page.getByText('Your closet is empty.')).toBeVisible()
  await page.getByRole('link', { name: 'Scan closet' }).click()
  await expect(page).toHaveURL(/\/scan/)

  await page.getByRole('tab', { name: 'Photo' }).click()
  await page.getByLabel('Closet photo').setInputFiles('tests/fixtures/closet.jpg')
  await expect(page.getByRole('heading', { name: /Found 6 pieces/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Navy wool overcoat')).toBeVisible()
  await page.getByRole('button', { name: 'Add 6 pieces' }).click()

  await expect(page).toHaveURL(/\/closet/)
  await expect(page.getByText('6 pieces')).toBeVisible()
  await expect(page.getByText('Selvedge jeans')).toBeVisible()

  await page.getByRole('button', { name: /Selvedge jeans/ }).click()
  await page.getByRole('button', { name: 'Delete piece' }).click()
  await expect(page.getByText('5 pieces')).toBeVisible()
  await expect(page.getByText('Selvedge jeans')).toHaveCount(0)

  await page.getByRole('button', { name: 'Shoes' }).click()
  await expect(page.getByRole('button', { name: /Brown suede loafers/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Oat merino crewneck/ })).toHaveCount(0)
})

test('in review, deleting a tapped piece closes the sheet; one by one, it moves on and says so', async ({ page }) => {
  await signIn(page)
  await page.goto('/scan')
  await page.getByRole('tab', { name: 'Photo' }).click()
  await page.getByLabel('Closet photo').setInputFiles('tests/fixtures/closet.jpg')
  await expect(page.getByRole('heading', { name: /Found 6 pieces/ })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: /Navy wool overcoat/ }).click()
  await page.getByRole('button', { name: 'Delete piece' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('heading', { name: /Found 5 pieces/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Navy wool overcoat/ })).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('Deleted Navy wool overcoat')

  await page.getByRole('button', { name: 'Review one by one' }).click()
  const first = await page.getByRole('dialog').getAttribute('aria-label')
  await page.getByRole('button', { name: 'Delete piece' }).click()
  await expect(page.getByRole('heading', { name: /Found 4 pieces/ })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).not.toHaveAttribute('aria-label', first!)
  await expect(page.getByRole('status')).toContainText(`Deleted ${first!.replace(/^Edit /, '')}`)
})
