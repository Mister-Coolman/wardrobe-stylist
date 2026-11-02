import { Button } from '@/components/ui/Button'

/** Plain form POST so it works before hydration. */
export function TryDemo() {
  return (
    <form method="post" action="/api/demo">
      <Button variant="secondary" className="w-full" type="submit">Try the demo</Button>
      <p className="mt-2 text-sm text-ink-muted">No account needed: a copy of a real closet and a sample calendar.</p>
    </form>
  )
}
