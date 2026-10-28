import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { PollVote } from '@/components/today/PollVote'
import { getRepo } from '@/lib/db/repo'
import { pollsEnabled } from '@/lib/polls'

export const dynamic = 'force-dynamic'

/** Public page — no sign-in. Shows the looks and takes one vote. */
export default async function PollPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!pollsEnabled()) notFound()
  const { slug } = await params
  const repo = await getRepo()
  const poll = await repo.getPoll(slug)
  if (!poll) notFound()
  const garments = await repo.listGarments(poll.userId)
  const media = (u: string) => (u.startsWith('/fixtures/') ? u : `/api/p/${slug}/media?u=${encodeURIComponent(u)}`)
  const looks = (await Promise.all(poll.outfitIds.map((id) => repo.getOutfit(poll.userId, id)))).flatMap((o, i) => o ? [{
    id: o.id, label: `Look ${String(i + 1).padStart(2, '0')}`, title: o.title,
    render: o.renderUrl ? media(o.renderUrl) : null,
    pieces: o.garmentIds.map((g) => garments.find((x) => x.id === g)).filter((g) => !!g).map((g) => ({ name: g!.name, url: media(g!.cutoutUrl) })),
  }] : [])
  const voted = !!(await cookies()).get(`voted_${slug}`)
  return (
    <main className="mx-auto max-w-[560px] px-5 pt-[calc(32px+env(safe-area-inset-top))] pb-16">
      <p className="label text-ink-muted">A friend is getting dressed</p>
      <h1 className="display mt-2 text-4xl">Which look?</h1>
      <PollVote slug={slug} looks={looks} alreadyVoted={voted} />
    </main>
  )
}
