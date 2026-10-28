import { cookies } from 'next/headers'
import { getRepo } from '@/lib/db/repo'
import { DEV_COOKIE, devLoginEmail } from '@/lib/session'

export async function POST(req: Request) {
  const email = devLoginEmail()
  if (!email) return new Response('Not found', { status: 404 })
  ;(await cookies()).set(DEV_COOKIE, email, { httpOnly: true, sameSite: 'lax', path: '/' })
  const onboarded = !!(await (await getRepo()).getProfile(email))
  return Response.redirect(new URL(onboarded ? '/today' : '/onboarding/setup', req.url), 303)
}
