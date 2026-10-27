import { signIn } from '@/auth'
import { Button } from '@/components/ui/Button'

export function GoogleSignIn() {
  return (
    <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/onboarding/setup' }) }}>
      <Button className="w-full" type="submit">Sign in with Google</Button>
    </form>
  )
}
