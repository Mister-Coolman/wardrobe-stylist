import { cookies } from 'next/headers'
import { getRepo } from '@/lib/db/repo'
import { DEMO_COOKIE, signDemo, startDemo } from '@/lib/demo'
import { getStorage } from '@/lib/storage'

export const maxDuration = 60

/** "Try the demo": a fresh user with a copy of DEMO_SOURCE_USER's closet, signed in by cookie for a week. */
export async function POST(req: Request) {
  const source = process.env.DEMO_SOURCE_USER
  if (!source || !process.env.AUTH_SECRET) return new Response('Not found', { status: 404 })
  const id = await startDemo(await getRepo(), getStorage(), source)
  if (!id) return Response.redirect(new URL('/onboarding?demo=full', req.url), 303)
  ;(await cookies()).set(DEMO_COOKIE, signDemo(id), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 })
  return Response.redirect(new URL('/today', req.url), 303)
}
