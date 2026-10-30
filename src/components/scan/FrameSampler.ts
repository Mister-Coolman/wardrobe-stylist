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
const toJpeg = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.7))

/** Resolves on the first of `ok`, rejects on 'error' or after ms with a message naming the step that stalled. */
function waitFor(v: HTMLVideoElement, ok: string, ms: number, step: string): Promise<void> {
  return new Promise((res, rej) => {
    const done = (f: () => void) => { clearTimeout(t); v.removeEventListener(ok, onOk); v.removeEventListener('error', onErr); f() }
    const onOk = () => done(res)
    const onErr = () => done(() => rej(new Error('Couldn’t read that video — try recording again, or take a photo.')))
    const t = setTimeout(() => done(() => rej(new Error(`The video didn’t load (${step}) — try again, or take a photo.`))), ms)
    v.addEventListener(ok, onOk); v.addEventListener('error', onErr)
  })
}

export async function sampleVideo(file: File, onProgress?: (done: number, total: number) => void): Promise<Blob[]> {
  const url = URL.createObjectURL(file)
  const v = document.createElement('video')
  v.muted = true; v.playsInline = true; v.preload = 'auto'
  try {
    // iPhones load nothing for a video until asked, and may decode no frames until it plays: load, then play and pause it muted
    const loaded = waitFor(v, 'loadedmetadata', 15_000, 'metadata')
    v.src = url; v.load()
    await loaded
    await v.play().then(() => v.pause(), () => {})
    if (!Number.isFinite(v.duration) || v.duration <= 0) throw new Error('Couldn’t read that video — try recording again, or take a photo.')
    const total = Math.min(MAX_FRAMES, Math.max(1, Math.floor(v.duration * FPS)))
    const step = v.duration / total
    const c = canvasFor(v.videoWidth, v.videoHeight)
    const ctx = c.getContext('2d')!
    const frames: Blob[] = []
    onProgress?.(0, total)
    for (let i = 0; i < total; i++) {
      const seeked = waitFor(v, 'seeked', 10_000, `frame ${i + 1}`)
      v.currentTime = Math.min(v.duration - 0.01, i * step + step / 2)
      await seeked
      ctx.drawImage(v, 0, 0, c.width, c.height)
      frames.push(await toJpeg(c))
      onProgress?.(i + 1, total)
    }
    return frames
  } finally {
    v.removeAttribute('src'); v.load()
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
