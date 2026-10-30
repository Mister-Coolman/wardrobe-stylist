import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { dispatchTool } from '@/lib/agent/tools'
import type { ToolContext } from '@/lib/agent/tools'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import type { Card } from '@/lib/domain/types'
import { getModels } from '@/lib/models'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'
import { MOCK_PRODUCTS } from '@/lib/shop/search'

const user = { userId: 'u1', email: 'u1', googleAccessToken: null }
let repo: Repo
let ctx: ToolContext
beforeEach(async () => {
  vi.stubEnv('WEATHER', 'fixture')
  vi.stubEnv('MEDIA_DIR', mkdtempSync(join(tmpdir(), 'media-')))
  repo = createLocalRepo(join(mkdtempSync(join(tmpdir(), 'tools-')), 'db.json'))
  await repo.insertGarments(sampleCloset('u1').map((g) => ({ ...g, confirmed: true })))
  ctx = { user, repo, models: getModels(), cards: [], channel: 'web' }
})
const call = (name: string, args: object = {}) => dispatchTool(name, JSON.stringify(args), ctx) as Promise<Record<string, unknown>>
const outfitOf = (c: Card | undefined) => { if (c?.kind !== 'outfit') throw new Error(`not an outfit card: ${c?.kind}`); return c }
const named = async (re: RegExp) => (await repo.listGarments('u1')).find((g) => re.test(g.name))!

describe('look tools', () => {
  test('swap_piece keeps every piece but the dropped one', async () => {
    await call('plan_outfit')
    const first = outfitOf(ctx.cards[0])
    const bottom = first.pieces.find((p) => /jeans|trousers|sweatpants/i.test(p.name))!
    const r = await call('swap_piece', { outfitId: first.outfitId, drop: [bottom.id], wish: 'smarter' })
    expect(r.error).toBeUndefined()
    const second = outfitOf(ctx.cards[1])
    const ids = second.pieces.map((p) => p.id)
    for (const p of first.pieces) if (p.id !== bottom.id) expect(ids).toContain(p.id)
    expect(ids).not.toContain(bottom.id)
  })

  test('another_look gives a different outfit', async () => {
    await call('plan_outfit')
    await call('another_look')
    const [a, b] = ctx.cards.map(outfitOf)
    expect(b.outfitId).not.toBe(a.outfitId)
    expect(b.pieces.map((p) => p.id).sort()).not.toEqual(a.pieces.map((p) => p.id).sort())
  })

  test('plan_outfit with a wish passes it to the stylist', async () => {
    const propose = vi.fn(getModels().stylist.propose)
    ctx.models = { ...getModels(), stylist: { ...getModels().stylist, propose } }
    await call('plan_outfit', { wish: 'fall themed' })
    expect(propose.mock.calls[0][0].wish).toBe('fall themed')
  })
})

describe('closet tools', () => {
  test('set_status puts a piece in the laundry and shows it', async () => {
    const oxford = await named(/oxford/i)
    await call('set_status', { ids: [oxford.id], status: 'laundry' })
    expect((await named(/oxford/i)).status).toBe('laundry')
    expect(ctx.cards[0]).toMatchObject({ kind: 'pieces', pieces: [{ id: oxford.id, status: 'laundry' }] })
  })

  test('edit_piece changes only the given fields', async () => {
    const jeans = await named(/jeans/i)
    await call('edit_piece', { id: jeans.id, brand: 'Levi’s', fit: 'slim' })
    const after = await named(/jeans/i)
    expect(after).toMatchObject({ brand: 'Levi’s', fit: 'slim', name: jeans.name, tags: jeans.tags })
  })

  test('delete_piece without confirm refuses and keeps the piece', async () => {
    const jeans = await named(/jeans/i)
    expect((await call('delete_piece', { id: jeans.id, confirm: false })).error).toMatch(/ask/)
    expect(await named(/jeans/i)).toBeTruthy()
    await call('delete_piece', { id: jeans.id, confirm: true })
    expect(await named(/jeans/i)).toBeUndefined()
  })
})

describe('store tools', () => {
  test('shop_search pushes a listings card', async () => {
    await call('shop_search', { query: 'black under armour sweatpants' })
    expect(ctx.cards[0]).toMatchObject({ kind: 'listings', products: [{ store: 'Under Armour' }] })
  })

  test('add_listing 2 adds the second listing of the newest card, confirmed, named from it', async () => {
    ctx.lastListings = MOCK_PRODUCTS
    const r = await call('add_listing', { number: 2 })
    expect(r.error).toBeUndefined()
    const added = ctx.cards.find((c) => c.kind === 'added')
    expect(added?.kind === 'added' && added.garmentIds).toHaveLength(1)
    const g = (await repo.listGarments('u1', { confirmed: true })).find((x) => added?.kind === 'added' && x.id === added.garmentIds[0])
    expect(g).toMatchObject({ name: expect.stringMatching(/Nautica Classic Fit Deck Polo$/), brand: 'Nautica', confirmed: true })
  })

  test('add_listing with no listings card is an error', async () => {
    expect((await call('add_listing', { number: 1 })).error).toMatch(/listings/)
  })
})
