import { cookies } from 'next/headers'
import { DEV_COOKIE, devLoginEmail } from '@/lib/session'

export async function POST(req: Request) {
  const email = devLoginEmail()
  if (!email) return new Response('Not found', { status: 404 })
  ;(await cookies()).set(DEV_COOKIE, email, { httpOnly: true, sameSite: 'lax', path: '/' })
  return Response.redirect(new URL('/today', req.url), 303)
}
