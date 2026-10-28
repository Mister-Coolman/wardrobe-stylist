import { cookies } from 'next/headers'
import { DEV_COOKIE } from '@/lib/session'

export async function POST(req: Request) {
  ;(await cookies()).delete(DEV_COOKIE)
  if (process.env.AUTH_SECRET) {
    const { signOut } = await import('@/auth')
    await signOut({ redirect: false })
  }
  return Response.redirect(new URL('/onboarding', req.url), 303)
}
