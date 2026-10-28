import Link from 'next/link'
import { TripForm } from '@/components/trips/TripForm'
import { getRepo } from '@/lib/db/repo'
import { addDays, localDate } from '@/lib/domain/dates'
import { fetchCalendarRange } from '@/lib/integrations/calendar'
import { profileFor } from '@/lib/profile'
import { requireUser } from '@/lib/session'
import { detectTrips } from '@/lib/stylist/trip'
import { range } from '@/lib/ui/dates'

export const dynamic = 'force-dynamic'

export default async function TripsPage() {
  const u = await requireUser()
  const repo = await getRepo()
  const [trips, profile] = await Promise.all([repo.listTrips(u.userId), profileFor(repo, u.userId)])
  const today = localDate(profile.tz)
  const upcoming = u.googleAccessToken
    ? detectTrips(await fetchCalendarRange(u.googleAccessToken, today, addDays(today, 60), profile.tz, u.userId).catch(() => []))
        .filter((t) => !trips.some((x) => x.startDate === t.startDate && x.destination.toLowerCase() === t.destination.toLowerCase()))
    : []
  const suggestion = upcoming[0]

  return (
    <>
      <h1 className="display text-3xl">Trips</h1>
      {suggestion && (
        <p className="mt-4">
          From your calendar: <span className="font-medium">{suggestion.destination} · {range(suggestion.startDate, suggestion.endDate)}</span> — plan packing?
        </p>
      )}
      <div className="mt-6">
        <TripForm defaults={suggestion ?? { destination: '', startDate: addDays(today, 1), endDate: addDays(today, 3) }} />
      </div>
      <section className="mt-12">
        <h2 className="label text-ink-muted">Your trips</h2>
        {trips.length ? (
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {trips.map((t) => (
              <li key={t.id}>
                <Link href={`/trips/${t.id}`} className="flex min-h-14 items-baseline justify-between gap-4 py-3">
                  <span className="display text-xl">{t.destination}</span>
                  <span className="text-sm text-ink-muted tnum">{range(t.startDate, t.endDate)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-ink-muted">No trips yet.</p>}
      </section>
    </>
  )
}
