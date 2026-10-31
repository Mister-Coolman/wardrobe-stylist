// muse-spark-1.3 vision + JSON-schema output (POST /v1/chat/completions).
import { z } from 'zod'
import { GarmentTagsSchema, ListingDetailsSchema } from '../schemas'
import type { Tagger } from '../types'
import { structured, toDataUrl } from './client'

const GUIDE = `You tag one garment from a cutout photo for a wardrobe app.
category: outerwear = worn over other clothes (coats, jackets, shackets, blazers, parkas, zip-up fleeces); top = shirts, tees, knitwear; bottom = trousers, jeans, skirts, shorts; onepiece = dresses, jumpsuits; shoes = all footwear; accessory = belts, scarves, hats, bags; underwear and socks only for those.
subcategory for tops: tshirt = tees, polos, henleys, tanks; shirt = button-front shirts, flannels, and overshirt-weight shirts worn as a shirt; dress_shirt = crisp shirts for tailoring; sweater = knits, sweatshirts, hoodies, quarter-zips, cardigans, fleece pullovers; athletic = sportswear only.
name: short and specific like a shop listing ("Navy wool overcoat", "Selvedge jeans") — colour + material/detail + item. Never copy printed slogans or text from the garment into the name; say "graphic tee".
warmth: 1 tee, polo, linen; 2 oxford, flannel, light merino, denim jacket; 3 chunky knit, hoodie, fleece, chore coat; 4 wool overcoat, lined jacket; 5 puffer, parka.
formality: 1 gym kit, graphic tee, running shoes; 2 plain tee, hoodie, shorts, canvas sneakers; 3 polo, oxford, dark jeans, chinos, merino crew, leather sneakers, chelsea boots; 4 dress shirt, wool trousers, blazer, loafers, derbies; 5 suit, tuxedo, oxford dress shoes.
rainSafe: true if getting wet won't damage or ruin it (cotton, denim, wool, synthetics, rubber, treated leather); false for suede, nubuck, silk, linen, cashmere, canvas sneakers, light-coloured leather.
colors: plain lowercase words (navy, oat, charcoal). tags: material and notable details only (pique, deck polo, embroidered logo, tapered leg); for tops and outerwear always include the sleeve length (short sleeve, long sleeve, sleeveless) and the neckline or collar (crewneck, V-neck, button-down collar, polo collar, quarter-zip, hooded).
brand: only when a logo, label or signature mark is legible (Nautica, Uniqlo UT, Polo Ralph Lauren); otherwise null. Never guess.
fit: slim (close to the body, tapered), classic (straight, regular), relaxed (loose, roomy) or oversized (dropped shoulders, deliberately big); null when the cutout can't show it.`

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
        { type: 'text', text: 'Both cutouts come from one scan of a single closet, so the same piece often appears more than once. Is this the same garment seen twice? Ignore lighting, folding and angle; compare colour, pattern, collar, sleeve length and details. Answer same=true when they all match; same=false when anything differs.' },
        { type: 'image_url', image_url: { url: await toDataUrl(a, 512) } },
        { type: 'image_url', image_url: { url: await toDataUrl(b, 512) } },
      ] },
    ], { effort: 'minimal' })
    return r.same
  },
  async fromListing(title, currentName) {
    return structured('tagger', ListingDetailsSchema, 'listing_details', [
      { role: 'system', content: `From a store listing's title, describe the piece for a wardrobe app.
name: short like "Black Under Armour Rival fleece joggers": colour if given, brand, line, item; drop "Men's", sizes, store words and promo words ("best deal", "free shipping").
category: outerwear, top, bottom, onepiece, shoes or accessory. brand: as the listing gives it, else null.
fit: slim, classic (also "regular", "straight"), relaxed (also "loose") or oversized, only when the title says so; else null.
tags: material and notable details from the title (fleece, tapered leg, pique).
colors: the colours the title names, as plain lowercase words; [] when it names none (most don't).${currentName ? `
The owner calls this piece "${currentName.replace(/"/g, "'")}": when the title names no colour, start the name with the colour from the owner's name.` : ''}` },
      { role: 'user', content: title },
    ], { effort: 'minimal' })
  },
}
