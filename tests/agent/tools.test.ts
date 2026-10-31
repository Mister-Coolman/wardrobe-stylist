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

describe('render_look', () => {
  test('renders a look on a mannequin, as a new card with the picture; the default view stays as it was', async () => {
    await call('plan_outfit')
    const first = outfitOf(ctx.cards[0])
    const r = await call('render_look', { outfitId: first.outfitId, mode: 'mannequin' })
    expect(r.error).toBeUndefined()
    const card = outfitOf(ctx.cards[1])
    expect(card.outfitId).toBe(first.outfitId)
    expect(card.imageUrl).toMatch(/mannequin/)
    expect((await repo.getOutfit('u1', first.outfitId))?.renderMode).toBe('mannequin')
    expect((await repo.getProfile('u1'))?.renderMode ?? 'flatlay').not.toBe('mannequin')
  })
  test('always: true makes it the default view', async () => {
    await call('plan_outfit')
    await call('render_look', { outfitId: outfitOf(ctx.cards[0]).outfitId, mode: 'mannequin', always: true })
    expect((await repo.getProfile('u1'))?.renderMode).toBe('mannequin')
  })
  test('an unknown look is an error', async () =>
    expect((await call('render_look', { outfitId: 'missing', mode: 'mannequin' })).error).toMatch(/no such outfit/))
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

  test('duplicate_piece adds another of a piece and shows the copy', async () => {
    const jeans = await named(/jeans/i)
    const r = await call('duplicate_piece', { id: jeans.id })
    const all = (await repo.listGarments('u1')).filter((g) => g.name === jeans.name)
    expect(all).toHaveLength(2)
    expect(r.summary).toMatch(/You now have 2/)
    const copy = all.find((g) => g.id !== jeans.id)!
    expect(ctx.cards[0]).toMatchObject({ kind: 'pieces', pieces: [{ id: copy.id, status: 'clean' }] })
    expect((await call('duplicate_piece', { id: 'missing' })).error).toMatch(/no such piece/)
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

describe('what the stylist knows', () => {
  test('remember adds a note with piece ids; forget removes it; the 31st is refused', async () => {
    const [a, b] = (await repo.listGarments('u1')).map((g) => g.id)
    await call('remember', { text: 'this crewneck with this oxford', pieceIds: [a, b] })
    const notes = (await repo.getProfile('u1'))?.stylistNotes ?? []
    expect(notes).toMatchObject([{ text: 'this crewneck with this oxford', pieceIds: [a, b] }])
    await call('forget', { id: notes[0].id })
    expect((await repo.getProfile('u1'))?.stylistNotes).toEqual([])
    for (let i = 0; i < 30; i++) await call('remember', { text: `note ${i}` })
    expect((await call('remember', { text: 'one more' })).error).toMatch(/Too many notes/)
  })

  test('notes reach the stylist’s propose input', async () => {
    await call('remember', { text: 'navy with olive' })
    const propose = vi.fn(getModels().stylist.propose)
    ctx.models = { ...getModels(), stylist: { ...getModels().stylist, propose } }
    await call('plan_outfit')
    expect(propose.mock.calls[0][0].notes).toEqual(['navy with olive'])
  })
})

describe('photo tools', () => {
  const photo = async () => {
    const { readFileSync } = await import('node:fs')
    const { getStorage } = await import('@/lib/storage')
    return getStorage().put('test/thread/photo.jpg', readFileSync('tests/fixtures/closet.jpg'), 'image/jpeg')
  }

  test('add_photo_piece then keep_pieces adds the photo’s pieces, confirmed', async () => {
    ctx.imageUrl = await photo()
    const before = (await repo.listGarments('u1', { confirmed: true })).length
    const r = await call('add_photo_piece')
    expect(r.error).toBeUndefined()
    const card = ctx.cards[0]
    if (card.kind !== 'pieces') throw new Error('no pieces card')
    expect(card.pieces.length).toBeGreaterThan(0)
    expect((await repo.listGarments('u1', { confirmed: true })).length).toBe(before)
    await call('keep_pieces', { ids: card.pieces.map((p) => p.id) })
    expect((await repo.listGarments('u1', { confirmed: true })).length).toBe(before + card.pieces.length)
    expect(ctx.cards[1]).toMatchObject({ kind: 'added' })
  })

  test('photo tools without a photo say so', async () => {
    for (const t of ['add_photo_piece', 'rate_outfit', 'recreate_look']) expect((await call(t)).error).toMatch(/no photo/)
  })

  test('recreate_look passes the photo to the stylist and shows a look', async () => {
    ctx.imageUrl = '/api/media/test/thread/look.jpg'
    const propose = vi.fn(getModels().stylist.propose)
    ctx.models = { ...getModels(), stylist: { ...getModels().stylist, propose } }
    await call('recreate_look', { wish: 'from @someone’s reel' })
    expect(propose.mock.calls[0][0]).toMatchObject({ referenceImageUrl: '/api/media/test/thread/look.jpg', wish: 'from @someone’s reel' })
    expect(ctx.cards[0].kind).toBe('outfit')
  })

  test('rate_outfit gives the day to judge the photo against', async () => {
    ctx.imageUrl = '/api/media/test/thread/me.jpg'
    const r = await call('rate_outfit')
    expect(r).toMatchObject({ requiredFormality: expect.any(Number), weather: expect.any(String) })
  })
})
