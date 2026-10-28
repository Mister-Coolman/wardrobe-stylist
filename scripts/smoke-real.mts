// End-to-end smoke against the live Meta API: plan a rainy client day and a 3-day trip from the sample closet.
//   set -a; . ./.env.local; set +a; npx tsx scripts/smoke-real.mts
import { realModels } from '../src/lib/models/real'
import { sampleCloset } from '../src/lib/fixtures/sampleCloset'
import { defaultProfile } from '../src/lib/profile'
import { planOutfit } from '../src/lib/stylist/loop'
import { planTrip } from '../src/lib/stylist/trip'

const models = realModels()
const profile = defaultProfile('smoke')
const wardrobe = sampleCloset('smoke').map((g, i) => ({ ...g, id: `g${i + 1}` }))
const name = (id: string) => wardrobe.find((g) => g.id === id)?.name ?? id
const t = Date.now()
const lap = (label: string) => console.log(`  ${label}: ${((Date.now() - t) / 1000).toFixed(1)}s`)

const r = await planOutfit({
  day: { date: '2026-10-28', requiredFormality: 4, changeSuggestion: null,
    events: [{ id: 'e', userId: 'smoke', date: '2026-10-28', start: '10:00', end: '11:00', allDay: false, title: 'Client review', location: null, attendees: [], source: 'calendar', formality: 4 }],
    weather: { tempHighC: 14, tempLowC: 9, rainProbability: 80, windKph: 15, summary: 'Rain from 17:00' } },
  wardrobe, profile, models, renderMode: 'flatlay',
})
lap('outfit + flat lay')
if (!r.ok) throw new Error(`no outfit: ${r.missing}`)
console.log(`Look: ${r.outfit.title} — ${r.outfit.garmentIds.map(name).join(', ')}`)
console.log(`  best effort: ${r.bestEffort} · revisions: ${r.outfit.revisionLog.length} · render: ${r.outfit.renderMode} ${r.outfit.renderUrl ? `(${Math.round(r.outfit.renderUrl.length / 1024)} KB)` : ''}`)
for (const n of r.outfit.ruleReport) console.log(`  ${n.passed ? '✓' : '!'} ${n.note}`)

const trip = await planTrip({ destination: 'Chicago', startDate: '2026-11-05', endDate: '2026-11-07', profile, wardrobe, events: [], models,
  weatherFor: async () => ({ tempHighC: 12, tempLowC: 6, rainProbability: 20, windKph: 30, summary: 'Windy' }),
  geocode: async () => ({ lat: 41.88, lon: -87.63, name: 'Chicago' }) })
lap('3-day trip')
for (const [i, d] of trip.dayPlans.entries()) console.log(`  ${d.date}: ${trip.outfits[i]?.garmentIds.map(name).join(', ') ?? '—'}`)
console.log(`  warnings: ${trip.warnings.join(' ') || 'none'}`)

if (process.env.SMOKE_SAVE && r.outfit.renderUrl?.startsWith('data:')) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(process.env.SMOKE_SAVE, Buffer.from(r.outfit.renderUrl.split(',')[1], 'base64'))
  console.log(`  render saved to ${process.env.SMOKE_SAVE}`)
}
