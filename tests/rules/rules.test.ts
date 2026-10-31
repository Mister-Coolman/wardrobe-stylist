import { describe, expect, test } from 'vitest'
import { completeness } from '@/lib/rules/completeness'
import { formality } from '@/lib/rules/formality'
import { weather } from '@/lib/rules/weather'
import { availability } from '@/lib/rules/availability'
import { dailyRules, runRules } from '@/lib/rules/registry'
import { cand, ctx, event, garment, wardrobe, weather as wx } from '../fixtures/wardrobe'

describe('completeness', () => {
  test('missing shoes is a violation', () => {
    const v = completeness.check(cand('crew', 'jeans'), ctx())
    expect(v).toHaveLength(1)
    expect(v[0].message).toMatch(/shoes/i)
  })
  test('unknown garment id is a violation', () => {
    const v = completeness.check(cand('crew', 'jeans', 'sneakers', 'ghost'), ctx())
    expect(v.map((x) => x.message)).toContain('Unknown piece')
    expect(v.find((x) => x.message === 'Unknown piece')!.garmentIds).toEqual(['ghost'])
  })
  test('top + bottom + shoes passes', () => expect(completeness.check(cand('crew', 'jeans', 'sneakers'), ctx())).toEqual([]))
  describe('one piece per layer', () => {
    const polos = [...wardrobe,
      garment({ id: 'navyPolo', name: 'Navy pique polo shirt', category: 'top', subcategory: 'tshirt' }),
      garment({ id: 'redPolo', name: 'Red cotton polo shirt', category: 'top', subcategory: 'tshirt' }),
      garment({ id: 'parka', name: 'Green parka', category: 'outerwear', subcategory: 'jacket' }),
      // tagged before polos counted as tees
      garment({ id: 'greenPolo', name: 'Dark green cotton polo shirt', category: 'top', subcategory: 'shirt', tags: ['cotton', 'polo'] }),
      garment({ id: 'rlOxford', name: 'Polo Ralph Lauren oxford shirt', category: 'top', subcategory: 'shirt' })]
    const messages = (...ids: string[]) => completeness.check(cand(...ids), ctx({}, polos)).map((v) => v.message)

    test('a quarter-zip over two polos is rejected, naming both polos', () => {
      const v = completeness.check(cand('crew', 'navyPolo', 'redPolo', 'jeans', 'sneakers'), ctx({}, polos))
      expect(v).toHaveLength(1)
      expect(v[0].message).toBe("Navy pique polo shirt and Red cotton polo shirt don't go on together — one or the other")
      expect(v[0].garmentIds).toEqual(['navyPolo', 'redPolo'])
    })
    test('a polo tagged as a shirt still counts as a polo, but a Polo Ralph Lauren shirt is a shirt', () => {
      expect(messages('crew', 'navyPolo', 'greenPolo', 'jeans', 'sneakers')).toEqual(["Dark green cotton polo shirt and Navy pique polo shirt don't go on together — one or the other"])
      expect(messages('navyPolo', 'rlOxford', 'crew', 'jeans', 'sneakers')).toEqual([])
    })
    test('real layering passes: a polo under a sweater, a tee under a shirt under a sweater', () => {
      expect(messages('navyPolo', 'crew', 'jeans', 'sneakers')).toEqual([])
      expect(messages('navyPolo', 'oxford', 'crew', 'jeans', 'sneakers')).toEqual([])
    })
    test('two bottoms, two pairs of shoes or two coats are rejected', () => {
      expect(messages('crew', 'jeans', 'trousers', 'sneakers')).toEqual(["Charcoal wool trousers and Selvedge jeans don't go on together — one or the other"])
      expect(messages('crew', 'jeans', 'sneakers', 'boots')).toEqual(["Black leather boots and White leather sneakers don't go on together — one or the other"])
      expect(messages('crew', 'jeans', 'sneakers', 'coat', 'parka')).toEqual(["Green parka and Navy wool overcoat don't go on together — one or the other"])
    })
  })
  test('three of one layer are named together', () => {
    const tees = [...wardrobe, garment({ id: 't1', name: 'Grey tee', category: 'top', subcategory: 'tshirt' }), garment({ id: 't2', name: 'White tee', category: 'top', subcategory: 'tshirt' }),
      garment({ id: 't3', name: 'Black tee', category: 'top', subcategory: 'tshirt' })]
    expect(completeness.check(cand('t1', 't2', 't3', 'jeans', 'sneakers'), ctx({}, tees)).map((v) => v.message))
      .toEqual(["Black tee, Grey tee and White tee don't go on together — pick one"])
  })
  test('the note reads head to toe with shoes, and says when the closet has none', () => {
    expect(completeness.note(cand('crew', 'jeans', 'sneakers'), ctx())).toBe('Head to toe: 3 pieces')
    const noShoes = wardrobe.filter((g) => g.category !== 'shoes')
    expect(completeness.note(cand('crew', 'jeans'), ctx({}, noShoes))).toBe('Top and bottom sorted — no shoes in the closet yet')
  })
  test('without clean shoes in the closet, top + bottom is complete', () => {
    const noShoes = wardrobe.filter((g) => g.category !== 'shoes')
    expect(completeness.check(cand('crew', 'jeans'), ctx({}, noShoes))).toEqual([])
    const shoesInLaundry = wardrobe.map((g) => (g.category === 'shoes' ? { ...g, status: 'laundry' as const } : g))
    expect(completeness.check(cand('crew', 'jeans'), ctx({}, shoesInLaundry))).toEqual([])
  })
})

describe('formality', () => {
  test('jeans at a smart event (required 4) is a violation naming the jeans', () => {
    const v = formality.check(cand('oxford', 'jeans', 'loafers'), ctx({ requiredFormality: 4 }))
    expect(v).toHaveLength(1)
    expect(v[0].garmentIds).toContain('jeans')
  })
  test('messages and notes are plain words, no arrows or levels', () => {
    expect(formality.check(cand('oxford', 'jeans', 'loafers'), ctx({ requiredFormality: 4 }))[0].message).toBe('Selvedge jeans is too casual for a smart day')
    expect(formality.note(cand('oxford', 'trousers', 'loafers'), ctx({ requiredFormality: 4, events: [event({ title: 'Client pitch', formality: 4 })] }))).toBe('Dressed smart for Client pitch')
    expect(formality.note(cand('crew', 'jeans', 'sneakers'), ctx({ requiredFormality: 2 }))).toBe('A casual day')
  })
  test('dress shoes on a casual day (required 2) pass', () =>
    expect(formality.check(cand('crew', 'jeans', 'loafers'), ctx({ requiredFormality: 2 }))).toEqual([]))
  test('far too dressy (more than required + 2) is a violation', () =>
    expect(formality.check(cand('oxford', 'trousers', 'loafers'), ctx({ requiredFormality: 1 }))).toHaveLength(1))
})

describe('weather', () => {
  const rainy = { weather: wx({ tempLowC: 9, rainProbability: 80 }) }
  test('suede loafers in 80% rain is a violation naming the loafers', () => {
    const v = weather.check(cand('coat', 'crew', 'trousers', 'loafers'), ctx(rainy))
    expect(v).toHaveLength(1)
    expect(v[0].garmentIds).toEqual(['loafers'])
    expect(v[0].message).toMatch(/loafers/i)
  })
  test('leather boots in the same rain pass', () =>
    expect(weather.check(cand('coat', 'crew', 'trousers', 'boots'), ctx(rainy))).toEqual([]))
  test('too light for 9° low is a violation', () =>
    expect(weather.check(cand('oxford', 'trousers', 'boots'), ctx(rainy))).toHaveLength(1))

  describe('a closet that can’t reach the warmth the day asks for (no coat, 4° low)', () => {
    // warmest legal stack: polo (1) + flannel (2) + knit (3) = 6, under the 7 a 4° low asks for
    const noCoat = [
      garment({ id: 'polo', name: 'Navy pique polo shirt', category: 'top', subcategory: 'tshirt', warmth: 1 }),
      garment({ id: 'polo2', name: 'Red cotton polo shirt', category: 'top', subcategory: 'tshirt', warmth: 1 }),
      garment({ id: 'flannel', name: 'Flannel shirt', category: 'top', subcategory: 'shirt', warmth: 2 }),
      garment({ id: 'zip', name: 'Heather blue quarter-zip', category: 'top', subcategory: 'sweater', warmth: 3 }),
      garment({ id: 'cardigan', name: 'Laundry cardigan', category: 'top', subcategory: 'sweater', warmth: 5, status: 'laundry' }),
      garment({ id: 'jeans', name: 'Selvedge jeans', category: 'bottom', subcategory: 'jeans', warmth: 2 }),
    ]
    const cold = (...ids: string[]) => weather.check(cand(...ids), ctx({ weather: wx({ tempLowC: 4 }) }, noCoat))
    test('the warmest look the closet allows passes', () => expect(cold('polo', 'flannel', 'zip', 'jeans')).toEqual([]))
    test('anything lighter is still too light, in plain words: warmest layers, a coat would help, no warmth points', () => {
      const v = cold('polo', 'zip', 'jeans')
      expect(v).toHaveLength(1)
      expect(v[0].message).toBe('Too light for a low of 4° — wear your warmest layers; a coat would help')
    })
    test('the note says a coat would help', () =>
      expect(weather.note(cand('polo', 'flannel', 'zip', 'jeans'), ctx({ weather: wx({ tempLowC: 4 }) }, noCoat))).toBe('Weather: as warm as your closet goes for 4° — a coat would help'))
  })
  test.each([[22, 1, true], [22, 5, false], [15, 2, true], [15, 1, false], [8, 4, true], [8, 9, false], [7, 7, true], [7, 6, false]])(
    'low %d° with warmth %d → ok %s', (low, warmth, ok) => {
      const gs = [
        { id: 't', name: 'Top', category: 'top', subcategory: 'sweater', warmth },
        { id: 'b', name: 'Bottom', category: 'bottom', subcategory: 'jeans' },
        { id: 's', name: 'Shoes', category: 'shoes', subcategory: 'boots' },
        // a warm coat in the closet (not in the look), so the day's band applies rather than "the warmest you have"
        { id: 'c', name: 'Coat', category: 'outerwear', subcategory: 'coat', warmth: 9 },
      ].map((g) => ({ ...ctx().garments.get('crew')!, ...g })) as never[]
      const v = weather.check(cand('t', 'b', 's'), ctx({ weather: wx({ tempLowC: low }) }, gs))
      expect(v.length === 0).toBe(ok)
    })
})

describe('availability', () => {
  test('rust tee in the laundry is a violation', () => {
    const v = availability.check(cand('tee', 'jeans', 'sneakers'), ctx())
    expect(v).toHaveLength(1)
    expect(v[0].garmentIds).toEqual(['tee'])
  })
})

describe('runRules', () => {
  test('a valid outfit returns 4 passed results with notes', () => {
    const r = runRules(cand('coat', 'crew', 'trousers', 'boots'),
      ctx({ requiredFormality: 3, events: [event({ title: 'Client review', formality: 3 })], weather: wx({ rainProbability: 80 }) }), dailyRules)
    expect(r.violations).toEqual([])
    expect(r.results).toHaveLength(4)
    for (const res of r.results) { expect(res.passed).toBe(true); expect(res.note.length).toBeGreaterThan(0) }
  })
  test('violations from several rules are collected and their results fail', () => {
    const r = runRules(cand('tee', 'jeans', 'loafers'), ctx({ requiredFormality: 4, weather: wx({ rainProbability: 80 }) }), dailyRules)
    expect(new Set(r.violations.map((v) => v.ruleId))).toEqual(new Set(['formality', 'weather', 'availability']))
    expect(r.results.filter((x) => !x.passed).map((x) => x.ruleId).sort()).toEqual(['availability', 'formality', 'weather'])
  })
})

describe('notes with nothing to say are empty', () => {
  test('no pairing, no poll, no style profile, no reuse after day one', async () => {
    const { likedPairs } = await import('@/lib/rules/likedPairs')
    const { pollWinner } = await import('@/lib/rules/pollWinner')
    const { styleMatch } = await import('@/lib/rules/styleMatch')
    const { capsuleReuse } = await import('@/lib/rules/capsuleReuse')
    expect(likedPairs.note(cand('crew', 'jeans'), ctx())).toBe('')
    expect(pollWinner.note(cand('crew', 'jeans'), ctx())).toBe('')
    expect(styleMatch.note(cand('crew', 'jeans'), ctx())).toBe('')
    expect(capsuleReuse.note(cand('crew', 'jeans'), { ...ctx(), trip: { counts: {} } })).toBe('Packing light: day one')
    expect(capsuleReuse.note(cand('crew', 'jeans'), { ...ctx(), trip: { counts: { coat: 1 } } })).toBe('')
  })
  test('a trip piece past its limit is due a wash, in plain words', async () => {
    const { wearLimit } = await import('@/lib/rules/wearLimit')
    const c = { ...ctx(), trip: { counts: { jeans: 99 } } }
    expect(wearLimit.check(cand('crew', 'jeans'), c).map((v) => v.message)).toEqual(['Selvedge jeans: worn 99 times this trip — due a wash'])
  })
})

describe('likedPairs', () => {
  test('scores a candidate holding a remembered pair, and not one holding half of it', async () => {
    const { likedPairs } = await import('@/lib/rules/likedPairs')
    const [a, b, c] = wardrobe.map((g) => g.id)
    const base = ctx()
    const withNotes = { ...base, profile: { ...base.profile, stylistNotes: [{ id: 'n1', text: 'this with that', pieceIds: [a, b] }, { id: 'n2', text: 'navy with olive', pieceIds: [] }] } }
    expect(likedPairs.score!(cand(a, b, c), withNotes)).toBe(1)
    expect(likedPairs.score!(cand(a, c), withNotes)).toBe(0)
    expect(likedPairs.check(cand(a, c), withNotes)).toEqual([])
    expect(likedPairs.note(cand(a, b), withNotes)).toBe('A pairing you like')
  })
})

describe('fitting notes', () => {
  test('notes with nothing to say are not shown', async () => {
    const { shownNotes } = await import('@/components/today/FittingNotes')
    expect(shownNotes([{ ruleId: 'weather', passed: true, note: 'Weather: layered for 9° to 14°' }, { ruleId: 'pollWinner', passed: true, note: '' }]).map((r) => r.ruleId))
      .toEqual(['weather'])
  })
})
