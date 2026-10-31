import { expect, test } from 'vitest'
import { drawLook } from '@/lib/renderCache'
import { createMemoryStorage } from '@/lib/storage'
import type { Renderer, RenderPiece } from '@/lib/models/types'

const polo: RenderPiece = { cutoutUrl: '/api/media/k/cutouts/polo.png', name: 'Red cotton polo shirt', category: 'top', subcategory: 'tshirt', colors: ['red'], tags: ['short-sleeve'], brand: null, fit: null }
const jeans: RenderPiece = { cutoutUrl: '/api/media/k/cutouts/jeans.png', name: 'Dark wash jeans', category: 'bottom', subcategory: 'jeans', colors: ['indigo'], tags: [], brand: null, fit: null }

function counting(url = `data:image/jpeg;base64,${Buffer.from('jpeg').toString('base64')}`) {
  const calls: string[] = []
  const renderer: Renderer = { render: async ({ mode }) => { calls.push(mode); return { url } } }
  return { calls, renderer }
}

test('the same look in the same view is drawn once; the second time comes from storage', async () => {
  const storage = createMemoryStorage()
  const { calls, renderer } = counting()
  const a = await drawLook({ userId: 'u1', mode: 'mannequin', pieces: [polo, jeans], renderer, storage })
  const b = await drawLook({ userId: 'u1', mode: 'mannequin', pieces: [jeans, polo], renderer, storage })
  expect(a).toMatch(/^\/api\/media\/.+\/renders\/mannequin-\w+\.jpg$/)
  expect(b).toBe(a)
  expect(calls).toEqual(['mannequin'])
})

test('another view, a new photo of a piece, a renamed piece or a new person photo draws again', async () => {
  const storage = createMemoryStorage()
  const { calls, renderer } = counting()
  const draw = (o: Partial<Parameters<typeof drawLook>[0]>) => drawLook({ userId: 'u1', mode: 'mannequin', pieces: [polo, jeans], renderer, storage, ...o })
  await draw({})
  await draw({ mode: 'flatlay' })
  await draw({ pieces: [{ ...polo, cutoutUrl: '/api/media/k/cutouts/polo-store.png' }, jeans] })
  await draw({ pieces: [{ ...polo, name: 'Crimson cotton polo shirt' }, jeans] })
  await draw({ mode: 'tryon', personPhotoUrl: '/api/media/k/me.jpg' })
  await draw({ mode: 'tryon', personPhotoUrl: '/api/media/k/me-2.jpg' })
  expect(calls).toHaveLength(6)
  await draw({ mode: 'flatlay' })
  expect(calls).toHaveLength(6)
})

test('each owner has their own renders', async () => {
  const storage = createMemoryStorage()
  const { calls, renderer } = counting()
  await drawLook({ userId: 'u1', mode: 'flatlay', pieces: [polo, jeans], renderer, storage })
  await drawLook({ userId: 'u2', mode: 'flatlay', pieces: [polo, jeans], renderer, storage })
  expect(calls).toHaveLength(2)
})

test('a renderer that hands back an app path (the mock) is passed through, not stored', async () => {
  const storage = createMemoryStorage()
  const { calls, renderer } = counting('/fixtures/render-mannequin.svg')
  expect(await drawLook({ userId: 'u1', mode: 'mannequin', pieces: [polo], renderer, storage })).toBe('/fixtures/render-mannequin.svg')
  await drawLook({ userId: 'u1', mode: 'mannequin', pieces: [polo], renderer, storage })
  expect(calls).toHaveLength(2)
})
