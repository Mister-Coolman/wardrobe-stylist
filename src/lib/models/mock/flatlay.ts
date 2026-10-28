import sharp from 'sharp'
import { getStorage } from '@/lib/storage'

// Slots on an 800×1000 sheet, in the order cutouts arrive (outerwear first, shoes last).
const SLOTS: [number, number, number, number][] = [[30, 40, 400, 520], [420, 60, 350, 400], [440, 470, 320, 500], [60, 600, 330, 360], [600, 860, 160, 120]]

/** Lays the outfit's own cutouts on studio paper — the mock stand-in for Muse Image. Returns a data: URL. */
export async function composeFlatlay(cutoutUrls: string[]): Promise<string> {
  const storage = getStorage()
  const layers = await Promise.all(cutoutUrls.slice(0, SLOTS.length).map(async (u, i) => {
    const [x, y, w, h] = SLOTS[i]
    const input = await sharp(await storage.read(u), { density: 300 }).resize(w, h, { fit: 'inside' }).png().toBuffer()
    return { input, left: x, top: y }
  }))
  const out = await sharp({ create: { width: 800, height: 1000, channels: 3, background: { r: 233, g: 229, b: 220 } } })
    .composite(layers).jpeg({ quality: 82 }).toBuffer()
  return `data:image/jpeg;base64,${out.toString('base64')}`
}
