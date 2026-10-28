// muse-image-1.0 via POST /v1/images/edits (JSON body, 1–10 input images, b64_json out).
import { RENDER_TIMEOUT_MS } from '../types'
import type { Renderer } from '../types'
import { metaFetch, toDataUrl } from './client'

const FLATLAY = 'Arrange exactly these clothing pieces as an overhead flat-lay photograph on warm off-white paper (#E9E5DC), evenly lit, soft natural shadows, nothing else in frame. Outerwear top left, top beside it, bottoms below, shoes at the bottom. Keep every garment’s colour, fabric and details exactly as shown. No people, no text, no props.'
const TRYON = 'The first image is a person. Dress this exact person in exactly the clothing pieces shown in the other images, keeping their face, body, pose and the garments’ colours and details unchanged. Full-length photo, plain light background, natural light. No text.'

export const realRenderer: Renderer = {
  async render({ mode, cutoutUrls, personPhotoUrl }) {
    const sources = mode === 'tryon' && personPhotoUrl ? [personPhotoUrl, ...cutoutUrls] : cutoutUrls
    const images = await Promise.all(sources.slice(0, 10).map(async (u) => ({ image_url: await toDataUrl(u, 768) })))
    const res = await metaFetch('renderer', '/images/edits', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'muse-image-1.0', prompt: mode === 'tryon' && personPhotoUrl ? TRYON : FLATLAY, images, n: 1,
        size: '1024x1280', output_format: 'jpeg', reasoning_strength: 'low' }),
    }, RENDER_TIMEOUT_MS)
    const j = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
    const d = j.data?.[0]
    if (d?.b64_json) return { url: `data:image/jpeg;base64,${d.b64_json}` }
    if (d?.url) return { url: d.url }
    throw new Error('no image in response')
  },
}
