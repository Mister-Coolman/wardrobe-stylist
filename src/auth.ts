import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'

const SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar.readonly'

declare module 'next-auth' {
  interface Session { googleAccessToken: string | null; error?: 'RefreshFailed' }
}

async function refresh(refreshToken: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: 'refresh_token', refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`)
  return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google({ authorization: { params: { scope: SCOPES, access_type: 'offline', prompt: 'consent' } } })],
  pages: { signIn: '/onboarding' },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return { ...token, accessToken: account.access_token, refreshToken: account.refresh_token, expiresAt: account.expires_at }
      }
      if (typeof token.expiresAt === 'number' && Date.now() / 1000 < token.expiresAt - 60) return token
      if (typeof token.refreshToken !== 'string') return token
      try {
        const r = await refresh(token.refreshToken)
        return { ...token, accessToken: r.access_token, expiresAt: Math.floor(Date.now() / 1000) + r.expires_in, refreshToken: r.refresh_token ?? token.refreshToken, error: undefined }
      } catch {
        return { ...token, accessToken: undefined, error: 'RefreshFailed' }
      }
    },
    async session({ session, token }) {
      session.googleAccessToken = typeof token.accessToken === 'string' ? token.accessToken : null
      if (token.error === 'RefreshFailed') session.error = 'RefreshFailed'
      return session
    },
  },
})
