// Live Meta Model API contract tests. They cost money, so they only run with META_CONTRACT=1:
//   META_CONTRACT=1 npx vitest run tests/models/real.contract.test.ts
import { describe, expect, test } from 'vitest'
import { realModels } from '@/lib/models/real'
import { CandidateSchema, GarmentTagsSchema } from '@/lib/models/schemas'
import { day, event, wardrobe, weather } from '../fixtures/wardrobe'
import { silentWav } from '@/lib/models/real/wav'

const live = process.env.META_CONTRACT === '1' && !!process.env.META_API_KEY
const d = live ? describe : describe.skip
const fixtureWardrobe = wardrobe.map((g) => ({ ...g, cutoutUrl: `/fixtures/garments/${g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg` }))

d('Meta Model API contract', () => {
  const m = realModels()

  test('tagger: a cutout comes back as schema-valid garment tags', async () => {
    const tags = await m.tagger.tag('/fixtures/garments/navy-wool-overcoat.svg')
    expect(GarmentTagsSchema.safeParse(tags).success).toBe(true)
    expect(tags.category).toBe('outerwear')
  }, 60_000)

  test('stylist: propose returns candidates made of real wardrobe ids', async () => {
    const ids = new Set(wardrobe.map((g) => g.id))
    const cs = await m.stylist.propose({ day: day({ weather: weather({ rainProbability: 80 }), requiredFormality: 3 }), wardrobe: fixtureWardrobe, count: 3 })
    expect(cs.length).toBeGreaterThanOrEqual(1)
    for (const c of cs) {
      expect(CandidateSchema.safeParse(c).success).toBe(true)
      for (const id of c.garmentIds) expect(ids.has(id)).toBe(true)
    }
  }, 120_000)

  test('stylist: classifyEvents maps titles to 1–5', async () => {
    const r = await m.stylist.classifyEvents([event({ title: 'Client review' }), event({ title: 'Gym' })])
    expect(r['Client review']).toBeGreaterThanOrEqual(4)
    expect(r.Gym).toBeLessThanOrEqual(2)
  }, 60_000)

  test('transcriber: a short silent WAV returns a string', async () => {
    expect(typeof (await m.transcriber.transcribe(silentWav(0.5), 'audio/wav'))).toBe('string')
  }, 60_000)

  test('chat: calls a tool when asked to plan an outfit', async () => {
    const turn = await m.chat.complete([{ role: 'user', content: 'What should I wear today? I have drinks after work.' }],
      [{ name: 'plan_outfit', description: 'Plan an outfit for a day', parameters: { type: 'object', properties: {} } },
       { name: 'add_event', description: 'Add an event to today', parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } }])
    expect(turn.toolCalls.length).toBeGreaterThan(0)
  }, 60_000)

  test('renderer: a flat lay comes back as an image', async () => {
    const { url } = await m.renderer.render({ mode: 'flatlay', cutoutUrls: ['/fixtures/garments/navy-wool-overcoat.svg', '/fixtures/garments/selvedge-jeans.svg', '/fixtures/garments/black-leather-boots.svg'] })
    expect(url).toMatch(/^(data:image\/|https:)/)
  }, 120_000)
})
