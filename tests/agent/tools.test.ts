import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { dispatchTool } from '@/lib/agent/tools'
import type { ToolContext } from '@/lib/agent/tools'
import { createLocalRepo } from '@/lib/db/local'
import type { Repo } from '@/lib/db/repo'
import type { Card } from '@/lib/domain/types'
import { getModels } from '@/lib/models'
import { sampleCloset } from '@/lib/fixtures/sampleCloset'
import { MOCK_PRODUCTS } from '@/lib/shop/search'
import { planToday } from '@/lib/today'
import { addDays } from '@/lib/domain/dates'
import { defaultProfile } from '@/lib/profile'

const user = { userId: 'u1', email: 'u1', googleAccessToken: null }
let repo: Repo
let ctx: ToolContext
afterEach(() => { vi.useRealTimers() })
// midday in New York: from 9 pm a new look is for tomorrow, and these tests mean today
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-04T17:00:00Z'))
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
  test('a new day’s look isn’t the one planned for any of the last few days, worn or not', async () => {
    const d = '2026-11-01', ids: string[] = []
    for (let i = 0; i < 3; i++) {
      const p = await planToday(repo, user, { date: addDays(d, i) })
      if (!p.result.ok) throw new Error('no look')
      ids.push([...p.result.outfit.garmentIds].sort().join())
    }
    expect(new Set(ids).size).toBe(3)
  })
  test('log_wear by pieces: "I wore X and Y today" counts the wear for just those pieces', async () => {
    const before = await repo.listGarments('u1')
    const a = before[0], b = before.find((g) => g.category !== a.category)!
    const r = await call('log_wear', { ids: [a.id, b.id] })
    expect(r.error).toBeUndefined()
    expect(r.summary).toContain(a.name)
    const after = await repo.listGarments('u1')
    for (const g of [a, b]) expect(after.find((x) => x.id === g.id)).toMatchObject({ wearCount: g.wearCount + 1, wearsSinceWash: g.wearsSinceWash + 1 })
    for (const g of before) if (g.id !== a.id && g.id !== b.id) expect(after.find((x) => x.id === g.id)?.wearCount).toBe(g.wearCount)
    expect(await call('log_wear', { ids: ['nope'] })).toMatchObject({ error: expect.any(String) })
    expect(await call('log_wear', {})).toMatchObject({ error: expect.any(String) })
  })

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

  test('another_look is for the day of the newest look in view, whatever date the model guesses', async () => {
    await call('plan_outfit')
    const a = outfitOf(ctx.cards[0])
    ctx.cards = []
    ctx.shownLooks = [{ date: a.date, garmentIds: a.pieces.map((p) => p.id) }]
    await call('another_look', { date: addDays(a.date, 1) })
    const b = outfitOf(ctx.cards[0])
    expect(b.date).toBe(a.date)
    expect(b.pieces.map((p) => p.id).sort()).not.toEqual(a.pieces.map((p) => p.id).sort())
  })

  describe('never for a day that’s over; late in the evening, for tomorrow', () => {
    const at = async (iso: string) => {
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso))
      const tz = (await repo.getProfile('u1'))?.tz ?? defaultProfile('u1').tz
      return { tz, today: new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso)) }
    }
    afterEach(() => { vi.useRealTimers() })
    test('another look at 11:30 pm, replacing a look for that day, is for tomorrow', async () => {
      const { today } = await at('2026-11-04T04:30:00Z')
      ctx.shownLooks = [{ date: today, garmentIds: [] }]
      await call('another_look')
      expect(outfitOf(ctx.cards[0]).date).toBe(addDays(today, 1))
    })
    test('another look replacing yesterday’s look is for today', async () => {
      const { today } = await at('2026-11-04T15:00:00Z')
      ctx.shownLooks = [{ date: addDays(today, -1), garmentIds: [] }]
      await call('another_look')
      expect(outfitOf(ctx.cards[0]).date).toBe(today)
    })
    test('in the afternoon, a look for today stays today', async () => {
      const { today } = await at('2026-11-04T19:00:00Z')
      await call('plan_outfit', { date: today })
      expect(outfitOf(ctx.cards[0]).date).toBe(today)
    })
  })

  test('a look in view is not handed back for another day either', async () => {
    await call('plan_outfit')
    const a = outfitOf(ctx.cards[0])
    ctx.cards = []
    ctx.shownLooks = [{ date: a.date, garmentIds: a.pieces.map((p) => p.id) }]
    await call('plan_outfit', { date: addDays(a.date, 1) })
    const b = outfitOf(ctx.cards[0])
    expect(b.date).toBe(addDays(a.date, 1))
    expect(b.pieces.map((p) => p.id).sort()).not.toEqual(a.pieces.map((p) => p.id).sort())
  })

  test('plan_outfit with a wish passes it to the stylist', async () => {
    const propose = vi.fn(getModels().stylist.propose)
    ctx.models = { ...getModels(), stylist: { ...getModels().stylist, propose } }
    await call('plan_outfit', { wish: 'fall themed' })
    expect(propose.mock.calls[0][0].wish).toBe('fall themed')
  })
})

describe('what a look tells the stylist', () => {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-/i
  test('pieces and reasons by name, the title as summary, no ids', async () => {
    const r = await call('plan_outfit')
    const card = outfitOf(ctx.cards[0])
    expect(r.pieces).toEqual(card.pieces.map((p) => p.name))
    for (const k of Object.keys(r.rationale as object)) expect(card.pieces.map((p) => p.name)).toContain(k)
    expect(r.summary).toMatch(new RegExp(`^${r.title}\\.`))
    expect(JSON.stringify({ ...r, outfitId: '' })).not.toMatch(uuid)
    expect(r.gap).toBeUndefined()
  })

  test('a closet that can’t reach a cold day says a coat would help', async () => {
    for (const g of await repo.listGarments('u1')) if (g.category === 'outerwear' || g.subcategory === 'sweater') await repo.deleteGarment('u1', g.id)
    const r = await call('plan_outfit')
    expect(r.gap).toBe('a coat would help')
  })

  test('an empty closet asks for photos', async () => {
    for (const g of await repo.listGarments('u1')) await repo.deleteGarment('u1', g.id)
    expect((await call('plan_outfit')).summary).toBe('The closet is empty — send a photo of your clothes and I’ll add them.')
  })

  test('get_weather gives wind in the owner’s unit, no raw km/h key', async () => {
    await repo.upsertProfile({ ...defaultProfile('u1'), tempUnit: 'F' })
    const f = await call('get_weather')
    expect(f.wind).toBe('11 mph')
    expect(f.windKph).toBeUndefined()
    await repo.upsertProfile({ ...defaultProfile('u1'), tempUnit: 'C' })
    expect((await call('get_weather')).wind).toBe('18 km/h')
  })
})

describe('set_today', () => {
  test('an earlier look becomes what Today shows; the thread gets its card', async () => {
    await call('plan_outfit')
    await call('another_look')
    const first = outfitOf(ctx.cards[0])
    const r = await call('set_today', { outfitId: first.outfitId })
    expect(r.summary).toMatch(/Today.s look is now/)
    const plan = await planToday(repo, user)
    expect(plan.result.ok && plan.result.pieces.map((p) => p.id)).toEqual(first.pieces.map((p) => p.id))
    expect(outfitOf(ctx.cards[2]).pieces.map((p) => p.id)).toEqual(first.pieces.map((p) => p.id))
  })
  test('the look already on Today says so and adds nothing', async () => {
    await call('plan_outfit')
    const before = (await repo.listOutfitsFor('u1', outfitOf(ctx.cards[0]).date)).length
    expect((await call('set_today', { outfitId: outfitOf(ctx.cards[0]).outfitId })).summary).toMatch(/already today/i)
    expect(await repo.listOutfitsFor('u1', outfitOf(ctx.cards[0]).date)).toHaveLength(before)
  })
  test('an unknown look is an error', async () =>
    expect((await call('set_today', { outfitId: 'missing' })).error).toMatch(/no such outfit/))
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

  test('edit_piece: a new name with a different colour updates the saved colours', async () => {
    const jeans = await named(/jeans/i)
    await call('edit_piece', { id: jeans.id, name: 'Black selvedge jeans' })
    expect((await named(/jeans/i)).colors).toEqual(['black'])
  })

  test('delete_piece without confirm refuses, keeps the piece and shows it so its id survives', async () => {
    const jeans = await named(/jeans/i)
    expect((await call('delete_piece', { id: jeans.id, confirm: false })).error).toMatch(/Delete the Selvedge jeans for good\? Say yes, delete/)
    expect(await named(/jeans/i)).toBeTruthy()
    expect(ctx.cards[0]).toMatchObject({ kind: 'pieces', pieces: [{ id: jeans.id }] })
    ctx.userText = 'yes, delete'
    expect((await call('delete_piece', { id: jeans.id, confirm: true })).summary).toMatch(/Removed/)
    expect(await named(/jeans/i)).toBeUndefined()
  })

  test('delete_piece with confirm: true is refused unless the owner’s latest message says yes', async () => {
    const jeans = await named(/jeans/i)
    for (const text of [undefined, 'match this look', 'delete the selvedge jeans']) {
      ctx.userText = text
      expect((await call('delete_piece', { id: jeans.id, confirm: true })).error).toMatch(/ask/i)
    }
    expect(await named(/jeans/i)).toBeTruthy()
  })

  test('search_wardrobe matches every word, in any order', async () => {
    const r = await call('search_wardrobe', { query: 'white shirt' })
    expect((r.pieces as { name: string }[]).map((p) => p.name)).toEqual(['White oxford shirt'])
    expect((await call('search_wardrobe', { query: 'white blazer' })).count).toBe(0)
  })

  test('set_status says what happened in plain words', async () => {
    const oxford = await named(/oxford/i)
    expect((await call('set_status', { ids: [oxford.id], status: 'laundry' })).summary).toBe('White oxford shirt is in the laundry now.')
    expect((await call('set_status', { ids: [oxford.id], status: 'worn' })).summary).toBe('White oxford shirt marked worn.')
    expect((await call('set_status', { ids: [oxford.id], status: 'clean' })).summary).toBe('White oxford shirt is clean again.')
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
    const r = await call('shop_search', { query: 'black under armour sweatpants' })
    expect(ctx.cards[0]).toMatchObject({ kind: 'listings', products: [{ store: 'Under Armour' }] })
    expect(r.summary).toMatch(/^Found \d+ listings?\.$/)
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
    expect(r).toMatchObject({ dressCode: expect.stringMatching(/^(sporty|casual|smart casual|smart|formal)$/), weather: expect.any(String) })
    expect(r.requiredFormality).toBeUndefined()
  })
})
