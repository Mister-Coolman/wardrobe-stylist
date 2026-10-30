import sharp from 'sharp'
import { FIXTURE_TAGS } from '../fixtures/garments'
import type { ChatModel, ListingDetails, Renderer, SegmentTrack, Segmenter, Tagger, Transcriber } from '../types'
import { renderOrder } from '../types'

// Mask grid the mock "finds" in any frame: 3×2 regions of a 120×80 mask, plus a second sighting of region 0.
/** cutout url → its fixture, in order of first appearance in the current scan */
const seen = new Map<string, number>()

const REGIONS: [number, number, number, number][] = [
  [0, 0, 40, 40], [40, 0, 40, 40], [80, 0, 40, 40], [0, 40, 40, 40], [40, 40, 40, 40], [80, 40, 40, 40],
]

async function rectMask([x, y, w, h]: [number, number, number, number]): Promise<Buffer> {
  const pad = 3
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="black"/>` +
    `<rect x="${x + pad}" y="${y + pad}" width="${w - pad * 2}" height="${h - pad * 2}" fill="white"/></svg>`
  return sharp(Buffer.from(svg)).greyscale().png().toBuffer()
}

export const mockSegmenter: Segmenter = {
  async segment(frameUrls) {
    // each scan names its pieces from the first fixture on, whatever ran before
    seen.clear()
    if (!frameUrls.length) return []
    const tracks: SegmentTrack[] = []
    for (const [i, r] of REGIONS.entries()) {
      tracks.push({ trackId: `mock-${i}`, masks: [{ frameIndex: 0, maskPng: await rectMask(r), area: (r[2] - 6) * (r[3] - 6), bbox: r }] })
    }
    // the same coat filmed twice
    tracks.push({ trackId: 'mock-0-again', masks: [{ frameIndex: 0, maskPng: await rectMask(REGIONS[0]), area: 34 * 34, bbox: REGIONS[0] }] })
    return tracks
  },
}

export const mockTagger: Tagger = {
  async tag(cutoutUrl) {
    if (!seen.has(cutoutUrl)) seen.set(cutoutUrl, seen.size)
    return FIXTURE_TAGS[seen.get(cutoutUrl)! % FIXTURE_TAGS.length]
  },
  async sameItem(a, b) {
    // the pipeline names cutouts by content hash, so identical cutouts share a url
    return a === b
  },
  async fromListing(title) {
    return mockListing(title)
  },
}

const COLOURS = ['black', 'white', 'grey', 'navy', 'red', 'blue', 'green']
const BRANDS = ['Under Armour', 'Nautica', "Levi's", 'Uniqlo', 'Nike']
const FITS: [RegExp, ListingDetails['fit']][] = [[/\bslim\b/i, 'slim'], [/\b(classic|regular|straight)\b/i, 'classic'], [/\b(relaxed|loose)\b/i, 'relaxed'], [/\boversized\b/i, 'oversized']]
const CATEGORIES: [RegExp, ListingDetails['category']][] = [[/jogger|jean|pant|trouser|short/i, 'bottom'], [/coat|jacket|parka/i, 'outerwear'], [/shoe|sneaker|boot/i, 'shoes']]

/** Keyword reading of a listing title, standing in for the model. */
export function mockListing(title: string): ListingDetails {
  return {
    name: title.replace(/\b(Men's|Women's)\s*/g, '').replace(/\s+/g, ' ').trim(),
    category: CATEGORIES.find(([re]) => re.test(title))?.[1] ?? 'top',
    brand: BRANDS.find((b) => title.toLowerCase().includes(b.toLowerCase())) ?? null,
    fit: FITS.find(([re]) => re.test(title))?.[1] ?? null,
    tags: /fleece/i.test(title) ? ['fleece'] : [],
    colors: COLOURS.filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(title)),
  }
}

export const mockRenderer: Renderer = {
  async render({ mode, pieces }) {
    if (process.env.MOCK_RENDER_FAIL === '1') throw new Error('mock render failure')
    try {
      const { composeFlatlay } = await import('./flatlay')
      return { url: await composeFlatlay(renderOrder(pieces).map((p) => p.cutoutUrl)) }
    } catch {
      return { url: mode === 'tryon' ? '/fixtures/render-tryon.svg' : '/fixtures/render-flatlay.svg' }
    }
  },
}

export const mockTranscriber: Transcriber = {
  async transcribe() {
    return 'drinks after work'
  },
}

/** Scripted agent: maps a few phrases to tool calls, then summarizes the tool results. */
export const mockChat: ChatModel = {
  async complete(messages) {
    const last = messages[messages.length - 1]
    if (last.role === 'tool') {
      const results = messages.slice(messages.map((m) => m.role).lastIndexOf('assistant') + 1)
      const lastJson = (() => { try { return JSON.parse(results[results.length - 1].content as string) } catch { return {} } })()
      return { content: lastJson.summary ?? 'Done.', toolCalls: [] }
    }
    const raw = last.role === 'user' ? last.content : ''
    const text = raw.toLowerCase()
    const id = () => `call_${Math.random().toString(36).slice(2, 8)}`
    const date = (text.match(/\d{4}-\d{2}-\d{2}/) ?? [])[0]
    if (/pack|trip/.test(text)) {
      const city = (raw.match(/(?:to|for)\s+([A-Z][\w ]+?)(?:\s+(?:for|from|on)\b|[.,?!]|$)/) ?? [])[1] ?? 'Chicago'
      return { content: null, toolCalls: [{ id: id(), name: 'plan_trip', arguments: JSON.stringify({ destination: city.trim(), days: 3 }) }] }
    }
    const ev = text.match(/(drinks|dinner|date|gym|run|yoga|interview|client|wedding|party)[^.?!]*/)
    if (ev) {
      return { content: null, toolCalls: [
        { id: id(), name: 'add_event', arguments: JSON.stringify({ title: ev[0].trim(), ...(date ? { date } : {}) }) },
        { id: id(), name: 'plan_outfit', arguments: JSON.stringify(date ? { date } : {}) },
      ] }
    }
    if (/wear|outfit|look/.test(text)) return { content: null, toolCalls: [{ id: id(), name: 'plan_outfit', arguments: JSON.stringify(date ? { date } : {}) }] }
    return { content: 'Tell me what’s on today — “drinks after work”, “pack for Chicago” — and I’ll sort the clothes.', toolCalls: [] }
  },
}
