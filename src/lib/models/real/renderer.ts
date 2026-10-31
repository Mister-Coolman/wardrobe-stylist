// muse-image-1.0 via POST /v1/images/edits (JSON body, 1–10 input images, b64_json out).
// The model redraws what it's given, so the prompt names every image with its piece: a colour left only to the
// picture drifts (heather blue came back grey), and a fixed layout line asking for shoes made it invent a pair.
import { insideOut, sleeves } from '@/lib/domain/layers'
import { RENDER_TIMEOUT_MS } from '../types'
import { renderOrder } from '../types'
import type { Renderer, RenderPiece } from '../types'
import { metaFetch, toDataUrl } from './client'

// colours come from the name: the owner may have corrected it ("Heather blue…") while the tagged colours still say grey
const describe = (p: RenderPiece) => [p.category, sleeves(p) && `${sleeves(p)} sleeves`, p.fit && `${p.fit} fit`, p.brand, p.tags.join(', ')].filter(Boolean).join('; ')

/** On a body, what goes over what: left to guess, the model gave a short-sleeved polo long red cuffs under a quarter-zip. */
function worn(pieces: RenderPiece[]): string {
  const layers = insideOut(pieces)
  if (layers.length < 2) return ''
  const named = (p: RenderPiece) => `${p.name}${sleeves(p) ? ` (${sleeves(p)} sleeves)` : ''}`
  const lines = [`Worn inside to outside: ${layers.map(named).join(', then ')}.`]
  layers.forEach((p, i) => {
    if (sleeves(p) === 'short' && layers.slice(i + 1).some((o) => sleeves(o) === 'long'))
      lines.push(`${p.name} is short-sleeved and under long sleeves: only its collar shows at the neck — no ${p.colors[0] ? `${p.colors[0]} ` : ''}sleeves or cuffs at the wrists.`)
  })
  return `\n${lines.join(' ')}`
}

function layout(pieces: RenderPiece[]): string {
  const has = (c: string) => pieces.some((p) => p.category === c)
  const rows = [has('outerwear') && 'outerwear top left', (has('top') || has('onepiece')) && `${has('outerwear') ? 'tops beside it' : 'tops across the top'}`,
    has('bottom') && 'bottoms below, laid straight with the legs pointing down', has('shoes') && 'shoes at the bottom', has('accessory') && 'accessories to the side']
  return `Lay them out: ${rows.filter(Boolean).join(', ')}.${has('shoes') ? '' : ' There are no shoes in this outfit: show no shoes.'}`
}

const noShoes = (pieces: RenderPiece[]) => pieces.some((p) => p.category === 'shoes') ? '' : ' There are no shoes in this outfit: show no shoes.'

/** The instruction for one outfit. In a try-on the person is image 1, so the pieces start at image 2. */
export function renderPrompt(mode: 'tryon' | 'mannequin' | 'flatlay', pieces: RenderPiece[]): string {
  const first = mode === 'tryon' ? 2 : 1
  const list = renderOrder(pieces).map((p, i) => `Image ${i + first}: ${p.name} (${describe(p)})`).join('\n')
  const keep = 'The names are the owner\'s own descriptions. Keep each piece as named and photographed: its sleeve length, collar, buttons, logos and fabric. Where a name gives a colour, show that colour, even if the photo\'s lighting makes it look different. Do not restyle or swap anything.'
  if (mode === 'tryon') {
    return `Image 1 is a person. Dress this exact person in exactly these ${pieces.length} pieces, keeping their face, body and pose:\n${list}${worn(pieces)}\n${keep}${pieces.some((p) => p.category === 'shoes') ? '' : ' Keep the shoes they are already wearing.'} Full-length photo, plain light background, natural light. No text.`
  }
  if (mode === 'mannequin') {
    return `A full-length studio photograph of a featureless matte white mannequin (no face, no hair, no skin) standing on a plain light background, dressed in exactly these ${pieces.length} pieces:\n${list}${worn(pieces)}\n${keep}${noShoes(pieces)} No text.`
  }
  return `An overhead flat-lay photograph of exactly ${pieces.length} pieces, one per input image, on warm off-white paper (#E9E5DC), evenly lit, soft natural shadows:\n${list}\n${keep}\n${layout(pieces)} Nothing else in frame: no people, props, text or extra clothing.`
}

export const realRenderer: Renderer = {
  async render({ mode, pieces, personPhotoUrl }) {
    const ordered = renderOrder(pieces)
    const sources = mode === 'tryon' && personPhotoUrl ? [personPhotoUrl, ...ordered.map((p) => p.cutoutUrl)] : ordered.map((p) => p.cutoutUrl)
    const images = await Promise.all(sources.slice(0, 10).map(async (u) => ({ image_url: await toDataUrl(u, 1024) })))
    const res = await metaFetch('renderer', '/images/edits', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'muse-image-1.0', prompt: renderPrompt(mode === 'tryon' && !personPhotoUrl ? 'flatlay' : mode, ordered), images, n: 1,
        size: '1024x1280', output_format: 'jpeg', reasoning_strength: 'low' }),
    }, RENDER_TIMEOUT_MS)
    const j = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
    const d = j.data?.[0]
    if (d?.b64_json) return { url: `data:image/jpeg;base64,${d.b64_json}` }
    if (d?.url) return { url: d.url }
    throw new Error('no image in response')
  },
}
