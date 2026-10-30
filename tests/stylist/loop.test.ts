import { describe, expect, test } from 'vitest'
import { planOutfit } from '@/lib/stylist/loop'
import { getModels, ModelError } from '@/lib/models'
import type { Renderer, Stylist } from '@/lib/models'
import { day, profile, wardrobe, weather } from '../fixtures/wardrobe'

const models = getModels()
const rainy = day({ weather: weather({ tempLowC: 9, rainProbability: 80 }), requiredFormality: 3 })

const stub = (over: Partial<Stylist>): Stylist => ({ ...models.stylist, ...over })

describe('planOutfit', () => {
  test('rainy day: the loafers candidate is rejected and logged; the outfit uses boots', async () => {
    const r = await planOutfit({ day: rainy, wardrobe, profile, models })
    if (!r.ok) throw new Error('expected an outfit')
    expect(r.bestEffort).toBe(false)
    expect(r.outfit.revisionLog).toHaveLength(1)
    expect(r.outfit.revisionLog[0].rejected[0].candidate.garmentIds).toContain('loafers')
    expect(r.outfit.garmentIds).toContain('boots')
    expect(r.outfit.ruleReport.every((x) => x.passed)).toBe(true)
  })

  test('unknown garment ids every round → best effort with a failed completeness result', async () => {
    let calls = 0
    const junk = [{ garmentIds: ['crew', 'jeans', 'ghost-shoe'], rationale: {}, title: 'Ghost' }]
    const stylist = stub({ propose: async () => (calls++, junk), revise: async () => (calls++, junk) })
    const r = await planOutfit({ day: day(), wardrobe, profile, models: { ...models, stylist } })
    if (!r.ok) throw new Error('expected an outfit')
    expect(calls).toBe(3)
    expect(r.bestEffort).toBe(true)
    expect(r.outfit.ruleReport.find((x) => x.ruleId === 'completeness')?.passed).toBe(false)
    expect(r.outfit.revisionLog).toHaveLength(3)
  })

  test('malformed candidates are treated as violations, not crashes', async () => {
    const stylist = stub({ propose: async () => [{ nope: true } as never, ...(await models.stylist.propose({ day: day(), wardrobe, count: 3 }))] })
    const r = await planOutfit({ day: day(), wardrobe, profile, models: { ...models, stylist } })
    expect(r.ok).toBe(true)
  })

  test('a ModelError on the first propose is retried once', async () => {
    let calls = 0
    const stylist = stub({ propose: async (i) => { if (calls++ === 0) throw new ModelError('stylist', 'bad_output', 'junk'); return models.stylist.propose(i) } })
    const r = await planOutfit({ day: day(), wardrobe, profile, models: { ...models, stylist } })
    expect(calls).toBe(2)
    expect(r.ok).toBe(true)
  })

  test('a closet of just tops and bottoms still gets outfits, without shoes', async () => {
    const r = await planOutfit({ day: day(), wardrobe: wardrobe.filter((g) => g.category !== 'shoes'), profile, models })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const cats = r.outfit.garmentIds.map((id) => wardrobe.find((g) => g.id === id)!.category)
    expect(cats).toContain('top')
    expect(cats).toContain('bottom')
    expect(cats).not.toContain('shoes')
  })

  test('when the stylist keeps failing, the closest-fit fallback still finds a shoe-less outfit', async () => {
    const junk = [{ garmentIds: ['ghost'], rationale: {}, title: 'Ghost' }]
    const stylist = stub({ propose: async () => junk, revise: async () => junk })
    const r = await planOutfit({ day: day(), wardrobe: wardrobe.filter((g) => g.category !== 'shoes'), profile, models: { ...models, stylist } })
    if (!r.ok) throw new Error('expected an outfit')
    expect(r.outfit.ruleReport.find((x) => x.ruleId === 'completeness')?.passed).toBe(true)
  })

  test('everything in the laundry → insufficient_wardrobe naming every core category', async () => {
    const r = await planOutfit({ day: day(), wardrobe: wardrobe.map((g) => ({ ...g, status: 'laundry' as const })), profile, models })
    expect(r).toEqual({ ok: false, reason: 'insufficient_wardrobe', missing: ['top', 'bottom'] })
  })

  test('empty closet → insufficient_wardrobe', async () => {
    const r = await planOutfit({ day: day(), wardrobe: [], profile, models })
    expect(r.ok).toBe(false)
  })

  test('renderer failure falls back to pieces and still returns the outfit', async () => {
    const renderer: Renderer = { render: async () => { throw new ModelError('renderer', 'http', '500') } }
    const r = await planOutfit({ day: day(), wardrobe, profile, models: { ...models, renderer }, renderMode: 'flatlay' })
    if (!r.ok) throw new Error('expected an outfit')
    expect(r.outfit.renderMode).toBe('none')
    expect(r.outfit.renderUrl).toBeNull()
  })

  test('flatlay renders; none skips the renderer', async () => {
    let rendered = 0
    const renderer: Renderer = { render: async () => (rendered++, { url: '/fixtures/render-flatlay.svg' }) }
    const a = await planOutfit({ day: day(), wardrobe, profile, models: { ...models, renderer }, renderMode: 'flatlay' })
    const b = await planOutfit({ day: day(), wardrobe, profile, models: { ...models, renderer }, renderMode: 'none' })
    expect(a.ok && a.outfit.renderUrl).toBe('/fixtures/render-flatlay.svg')
    expect(b.ok && b.outfit.renderUrl).toBeNull()
    expect(rendered).toBe(1)
  })

  test('try-on without a photo of the user renders a flat lay instead', async () => {
    const r = await planOutfit({ day: day(), wardrobe, profile, models, renderMode: 'tryon' })
    expect(r.ok && r.outfit.renderMode).toBe('flatlay')
  })
})
