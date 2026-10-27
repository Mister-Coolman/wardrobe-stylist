import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const DEV_COOKIE = 'ws_dev_user'

export interface SessionUser { userId: string; email: string; googleAccessToken: string | null }

/** DEV_USER_EMAIL signs in without Google — development and e2e only. */
export function devLoginEmail(): string | null {
  const email = process.env.DEV_USER_EMAIL
  if (!email) return null
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_LOGIN !== '1') return null
  return email
}

export async function currentUser(): Promise<SessionUser | null> {
  const dev = devLoginEmail()
  if (dev && (await cookies()).get(DEV_COOKIE)?.value === dev) return { userId: dev, email: dev, googleAccessToken: null }
  if (!process.env.AUTH_SECRET) return null
  const { auth } = await import('@/auth')
  const s = await auth()
  const email = s?.user?.email
  return email ? { userId: email, email, googleAccessToken: s.googleAccessToken ?? null } : null
}

/** Server-only; redirects to /onboarding when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser()
  if (!u) redirect('/onboarding')
  return u
}
