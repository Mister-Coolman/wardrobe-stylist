import { Button } from '@/components/ui/Button'

/** Plain form POST so it works before hydration. */
export function DevLogin({ email }: { email: string }) {
  return (
    <form method="post" action="/api/dev-login">
      <Button variant="secondary" className="w-full" type="submit">Continue as {email}</Button>
    </form>
  )
}
