import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { seedCloset, signIn } from './helpers'

const send = async (page: Page, text: string) => {
  await page.getByRole('textbox', { name: 'Message' }).fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}
const looks = (page: Page) => page.getByRole('group', { name: /^Look:/ })
const piecesOf = async (card: ReturnType<Page['locator']>) => (await card.getByRole('listitem').allTextContents()).map((t) => t.trim())

test('the app opens on the Stylist tab', async ({ page }) => {
  await signIn(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/stylist/)
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link')).toHaveCount(4)
  await expect(nav.getByRole('link', { name: 'Stylist' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('heading', { name: 'What’s on today?' })).toBeVisible()
})

test('"drinks after work" shows a look card; the thread survives a reload; the look is on Today', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/stylist')
  await send(page, 'drinks after work')
  await expect(looks(page)).toHaveCount(1, { timeout: 30_000 })
  await page.reload()
  await expect(page.getByText('drinks after work', { exact: true })).toBeVisible()
  await expect(looks(page)).toHaveCount(1)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click()
  await expect(page.getByTestId('day-strip')).toContainText('drinks after work (added)', { timeout: 30_000 })
})

test('Another look from the card gives a second look card', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/stylist')
  await send(page, 'what should I wear')
  await looks(page).first().getByRole('button', { name: 'Another look' }).click()
  await expect(looks(page)).toHaveCount(2, { timeout: 30_000 })
  expect(await piecesOf(looks(page).nth(1))).not.toEqual(await piecesOf(looks(page).first()))
})

test('swipe a look card to reply "swap the …": that look changes, and the sent message shows the quote', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/stylist')
  await send(page, 'what should I wear')
  await expect(looks(page)).toHaveCount(1, { timeout: 30_000 })
  await send(page, 'another look')
  await expect(looks(page)).toHaveCount(2, { timeout: 30_000 })
  const first = await piecesOf(looks(page).first())
  const bottom = first.find((n) => /jeans|trousers|sweatpants/i.test(n))!
  await looks(page).first().scrollIntoViewIfNeeded()
  const box = (await looks(page).first().boundingBox())!
  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 50, box.y + 22, { steps: 4 })
  await page.mouse.move(box.x + 90, box.y + 24, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByRole('region', { name: 'Replying to' })).toContainText(bottom)
  await send(page, `swap the ${bottom.toLowerCase().split(' ').at(-1)}`)
  await expect(looks(page)).toHaveCount(3, { timeout: 30_000 })
  const third = await piecesOf(looks(page).nth(2))
  expect(third).not.toContain(bottom)
  for (const p of first) if (p !== bottom) expect(third).toContain(p)
  await expect(page.getByRole('region', { name: 'Replying to' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Quoted:/ }).last()).toContainText(bottom)
})

test('the Reply button does the same with the keyboard', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/stylist')
  await send(page, 'what should I wear')
  await expect(looks(page)).toHaveCount(1, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Reply to this message' }).last().focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Replying to' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel reply' }).click()
  await expect(page.getByRole('region', { name: 'Replying to' })).toHaveCount(0)
})

test('"I spilled coffee on the white oxford" puts it in the laundry', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/stylist')
  await send(page, 'I spilled coffee on the white oxford')
  await expect(page.getByRole('group', { name: 'Pieces' })).toContainText('White oxford shirt', { timeout: 30_000 })
  await page.goto('/closet')
  await page.getByRole('button', { name: /^Laundry/ }).click()
  await expect(page.getByRole('button', { name: /White oxford shirt/ })).toBeVisible()
})

test('a store search, then "Add" from the listings card adds the joggers', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/stylist')
  await send(page, 'add my black under armour sweatpants')
  const listings = page.getByRole('group', { name: 'Store listings' })
  await listings.getByRole('button', { name: /UA Rival Fleece Joggers/ }).click({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: 'See it in your closet' })).toBeVisible({ timeout: 30_000 })
  await page.goto('/closet')
  await expect(page.getByRole('button', { name: /Under Armour UA Rival Fleece Joggers/ })).toBeVisible()
})

test('a preference said in the thread shows in Settings, and can be removed there', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/stylist')
  await send(page, 'I like the oat crewneck with the white oxford')
  await expect(page.getByText(/Noted/)).toBeVisible({ timeout: 30_000 })
  await page.goto('/settings')
  const notes = page.getByRole('list', { name: 'Saved preferences' })
  await expect(notes).toContainText('I like the oat crewneck with the white oxford')
  await notes.getByRole('button', { name: /Remove/ }).click()
  await expect(page.getByRole('list', { name: 'Saved preferences' })).toHaveCount(0)
})

test('the mic on Closet opens the Stylist thread', async ({ page }) => {
  await signIn(page)
  await page.goto('/closet')
  await page.getByRole('link', { name: 'Talk to your stylist' }).click()
  await expect(page).toHaveURL(/\/stylist/)
})

test('Wore it on a look card logs it; Today says Logged after a reload', async ({ page }) => {
  await signIn(page)
  await seedCloset(page)
  await page.goto('/stylist')
  await send(page, 'what should I wear')
  await looks(page).first().getByRole('button', { name: 'Wore it' }).click({ timeout: 30_000 })
  await expect(page.getByText('Logged.')).toBeVisible({ timeout: 30_000 })
  await page.goto('/today')
  await expect(page.getByRole('button', { name: /Logged/ })).toBeVisible({ timeout: 30_000 })
})

test('send a photo, "add these", then "yes" → the pieces are in the closet', async ({ page }) => {
  await signIn(page)
  await page.goto('/stylist')
  await page.getByLabel('Add a photo').setInputFiles('tests/fixtures/closet.jpg')
  await expect(page.getByRole('img', { name: 'Photo to send' })).toBeVisible()
  await send(page, 'add these')
  await expect(page.getByRole('img', { name: 'Your photo' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Pieces' })).toBeVisible({ timeout: 30_000 })
  const found = await page.getByRole('group', { name: 'Pieces' }).locator('p:first-of-type').count()
  await send(page, 'yes')
  await expect(page.getByRole('link', { name: 'See it in your closet' })).toBeVisible({ timeout: 30_000 })
  await page.goto('/closet')
  await expect(page.getByText(`${found} pieces`)).toBeVisible()
})
