import { afterEach, describe, expect, test, vi } from 'vitest'
import { getModels } from '@/lib/models'
import { CandidateSchema, GarmentTagsSchema } from '@/lib/models/schemas'
import { day, event, wardrobe, weather } from '../fixtures/wardrobe'

afterEach(() => vi.unstubAllEnvs())

describe('getModels', () => {
  test('MODELS=mock returns all six adapters', () => {
    vi.stubEnv('MODELS', 'mock')
    const m = getModels()
    for (const k of ['segmenter', 'tagger', 'stylist', 'renderer', 'transcriber', 'chat'] as const) expect(m[k]).toBeDefined()
  })
  test('defaults to mock when MODELS is unset', () => {
    vi.stubEnv('MODELS', '')
    expect(getModels().stylist).toBeDefined()
  })
})

describe('mock stylist', () => {
  const { stylist } = getModels()
  test('propose returns count candidates whose ids all exist in the wardrobe', async () => {
    const ids = new Set(wardrobe.map((g) => g.id))
    const cs = await stylist.propose({ day: day(), wardrobe, count: 3 })
    expect(cs).toHaveLength(3)
    for (const c of cs) {
      expect(CandidateSchema.safeParse(c).success).toBe(true)
      for (const id of c.garmentIds) expect(ids.has(id)).toBe(true)
    }
  })
  test('on a rainy day the first candidate wears rain-unsafe shoes so revision is exercised', async () => {
    const [first] = await stylist.propose({ day: day({ weather: weather({ rainProbability: 80 }), requiredFormality: 3 }), wardrobe, count: 3 })
    expect(first.garmentIds).toContain('loafers')
  })
  test('classifyEvents uses keywords', async () => {
    const r = await stylist.classifyEvents([event({ title: 'Client review' }), event({ title: 'Dinner with Sam' }), event({ title: 'Gym' }), event({ title: 'Standup' })])
    expect(r).toEqual({ 'Client review': 4, 'Dinner with Sam': 3, Gym: 1, Standup: 2 })
  })
  test('suggestGaps returns valid garment tags', async () => {
    const gaps = await stylist.suggestGaps(wardrobe)
    expect(gaps.length).toBeGreaterThan(0)
    for (const g of gaps) expect(GarmentTagsSchema.safeParse(g).success).toBe(true)
  })
})

describe('other mocks', () => {
  const m = getModels()
  test('transcriber returns the fixture string', async () => expect(await m.transcriber.transcribe(Buffer.from(''), 'audio/webm')).toBe('drinks after work'))
  test('renderer returns a fixture url per mode', async () => {
    expect((await m.renderer.render({ mode: 'flatlay', pieces: [{ cutoutUrl: 'a', name: 'A', category: 'top', subcategory: 'shirt', colors: [], tags: [] }] })).url).toMatch(/^\/fixtures\//)
  })
  test('segmenter returns tracks with masks, including one duplicate', async () => {
    const tracks = await m.segmenter.segment(['/f/0.jpg'])
    expect(tracks.length).toBeGreaterThanOrEqual(3)
    for (const t of tracks) expect(t.masks[0].maskPng.length).toBeGreaterThan(0)
  })
  test('tagger tags parse and sameItem is identity on url', async () => {
    expect(GarmentTagsSchema.safeParse(await m.tagger.tag('/x/a.png')).success).toBe(true)
    expect(await m.tagger.sameItem('/x/a.png', '/x/a.png')).toBe(true)
    expect(await m.tagger.sameItem('/x/a.png', '/x/b.png')).toBe(false)
  })
})
