import { cookies } from 'next/headers'
import { DEMO_COOKIE } from '@/lib/demo'
import { DEV_COOKIE } from '@/lib/session'

export async function POST(req: Request) {
  const jar = await cookies()
  jar.delete(DEV_COOKIE)
  jar.delete(DEMO_COOKIE)
  if (process.env.AUTH_SECRET) {
    const { signOut } = await import('@/auth')
    await signOut({ redirect: false })
  }
  return Response.redirect(new URL('/onboarding', req.url), 303)
}
