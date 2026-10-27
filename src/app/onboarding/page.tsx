import { redirect } from 'next/navigation'
import { currentUser, devLoginEmail } from '@/lib/session'
import { DevLogin } from './DevLogin'
import { GoogleSignIn } from './GoogleSignIn'

export default async function Onboarding() {
  if (await currentUser()) redirect('/today')
  const dev = devLoginEmail()
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-end gap-8 px-5 pb-[calc(48px+env(safe-area-inset-bottom))]">
      <div>
        <p className="label text-ink-muted">Wardrobe Stylist</p>
        <h1 className="display mt-3 text-4xl">One outfit every morning, from clothes you own.</h1>
        <p className="mt-4 max-w-[48ch] text-ink-muted">
          Sign in with Google so your calendar can set the dress code. We only read events — nothing is written back.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {process.env.AUTH_GOOGLE_ID && <GoogleSignIn />}
        {dev && <DevLogin email={dev} />}
        {!process.env.AUTH_GOOGLE_ID && !dev && <p className="text-error">Sign-in isn’t configured on this server.</p>}
      </div>
    </main>
  )
}
