// muse-spark-1.3 vision + JSON-schema output (POST /v1/chat/completions).
import { z } from 'zod'
import { GarmentTagsSchema } from '../schemas'
import type { Tagger } from '../types'
import { structured, toDataUrl } from './client'

const GUIDE = `You tag one garment from a cutout photo for a wardrobe app.
category: outerwear = anything worn over other clothes (coats, jackets, blazers, overshirts, parkas); top = shirts, tees, knitwear; bottom = trousers, jeans, skirts, shorts; onepiece = dresses, jumpsuits.
name: short and specific like a shop listing ("Navy wool overcoat", "Selvedge jeans") — colour + material/detail + item.
formality 1 sporty · 2 casual · 3 smart casual · 4 smart · 5 formal. warmth 1 very light (tee) … 5 heaviest (parka).
rainSafe false for suede, canvas sneakers, silk, linen, delicate knits; true for leather, wool coats, synthetics, denim.
colors: plain lowercase words (navy, oat, charcoal). tags: material and notable details only.`

export const realTagger: Tagger = {
  async tag(cutoutUrl) {
    return structured('tagger', GarmentTagsSchema, 'garment_tags', [
      { role: 'system', content: GUIDE },
      { role: 'user', content: [{ type: 'text', text: 'Tag this piece.' }, { type: 'image_url', image_url: { url: await toDataUrl(cutoutUrl, 768) } }] },
    ], { effort: 'minimal' })
  },
  async sameItem(a, b) {
    if (a === b) return true
    const r = await structured('tagger', z.object({ same: z.boolean() }), 'same_item', [
      { role: 'user', content: [
        { type: 'text', text: 'Both cutouts come from one scan of a single closet, so the same piece often appears more than once. Is this the same garment seen twice? Answer same=true when color, cut and details all match; same=false when anything differs (another color, length, collar, pattern).' },
        { type: 'image_url', image_url: { url: await toDataUrl(a, 512) } },
        { type: 'image_url', image_url: { url: await toDataUrl(b, 512) } },
      ] },
    ], { effort: 'minimal' })
    return r.same
  },
}
