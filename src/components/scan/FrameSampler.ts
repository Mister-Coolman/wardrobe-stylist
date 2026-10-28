/** Client-side frame sampling so the server never needs ffmpeg: 2 fps, at most 120 frames, long edge ≤ 1280 px. */
export const FPS = 2
export const MAX_FRAMES = 120
const MAX_EDGE = 1280

function canvasFor(w: number, h: number) {
  const s = Math.min(1, MAX_EDGE / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * s); c.height = Math.round(h * s)
  return c
}
const toJpeg = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.85))

export async function sampleVideo(file: File, onProgress?: (done: number, total: number) => void): Promise<Blob[]> {
  const url = URL.createObjectURL(file)
  const v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url
  try {
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('Couldn’t read that video.')) })
    const total = Math.min(MAX_FRAMES, Math.max(1, Math.floor(v.duration * FPS)))
    const step = v.duration / total
    const c = canvasFor(v.videoWidth, v.videoHeight)
    const ctx = c.getContext('2d')!
    const frames: Blob[] = []
    for (let i = 0; i < total; i++) {
      await new Promise<void>((res) => { v.onseeked = () => res(); v.currentTime = Math.min(v.duration - 0.01, i * step + step / 2) })
      ctx.drawImage(v, 0, 0, c.width, c.height)
      frames.push(await toJpeg(c))
      onProgress?.(i + 1, total)
    }
    return frames
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Normalizes a photo (HEIC, PNG, huge JPEG) to one JPEG frame. */
export async function samplePhoto(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const c = canvasFor(bmp.width, bmp.height)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return toJpeg(c)
}
