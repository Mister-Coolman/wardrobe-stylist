import { after } from 'next/server'
import { getRepo } from '@/lib/db/repo'
import { getModels } from '@/lib/models'
import { getStorage } from '@/lib/storage'
import { handleInbound, verifySignature } from '@/lib/whatsapp/api'

// a look plus a render can take a while; Meta wants its 200 at once, so the work runs in after()
export const maxDuration = 300

/** Meta's webhook check: echo hub.challenge when the verify token matches. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const token = process.env.WHATSAPP_VERIFY_TOKEN
  if (!token || q.get('hub.mode') !== 'subscribe' || q.get('hub.verify_token') !== token) return new Response('forbidden', { status: 403 })
  return new Response(q.get('hub.challenge') ?? '')
}

export async function POST(req: Request) {
  const raw = await req.text()
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret || !verifySignature(raw, req.headers.get('x-hub-signature-256'), secret)) return new Response('bad signature', { status: 401 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }
  const repo = await getRepo()
  after(() => handleInbound(body, { repo, models: getModels(), storage: getStorage() }))
  return new Response('ok')
}
