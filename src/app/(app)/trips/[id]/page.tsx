import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PackingList } from '@/components/trips/PackingList'
import { getRepo } from '@/lib/db/repo'
import type { Garment } from '@/lib/domain/types'
import { profileFor } from '@/lib/profile'
import { requireUser } from '@/lib/session'
import { range, weekday } from '@/lib/ui/dates'
import { plural } from '@/lib/ui/format'
import { degrees, unitFor, withUnit } from '@/lib/ui/temperature'

export const dynamic = 'force-dynamic'

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  const { id } = await params
  const repo = await getRepo()
  const trip = await repo.getTrip(u.userId, id)
  if (!trip) notFound()
  const [wardrobe, profile] = await Promise.all([repo.listGarments(u.userId), profileFor(repo, u.userId)])
  const byId = new Map(wardrobe.map((g) => [g.id, g]))
  const outfits = await Promise.all(trip.dayPlans.map((d) => (d.outfitId ? repo.getOutfit(u.userId, d.outfitId) : null)))
  const items = trip.packingList.map((p) => ({ garment: byId.get(p.garmentId), days: p.days })).filter((x): x is { garment: Garment; days: number } => !!x.garment)

  const ws = trip.dayPlans.map((d) => d.weather).filter((w) => w && w.summary !== 'unknown')
  const lo = ws.length ? Math.min(...ws.map((w) => w!.tempLowC)) : null
  const hi = ws.length ? Math.max(...ws.map((w) => w!.tempHighC)) : null
  const windy = ws.some((w) => w!.windKph >= 25), wet = ws.some((w) => w!.rainProbability >= 50)
  const summary = [plural(items.length, 'piece'), lo != null ? `${degrees(lo, unitFor(profile))} to ${degrees(hi!, unitFor(profile))}${wet ? ', rain' : windy ? ', windy' : ''}` : 'forecast not out yet'].join(' · ')

  return (
    <>
      <p className="label text-ink-muted tnum">{range(trip.startDate, trip.endDate)}</p>
      <h1 className="display mt-2 text-4xl">{trip.destination}</h1>
      <p className="mt-2 text-ink-muted tnum">{summary}</p>
      {trip.warnings.map((w) => <p key={w} className="mt-3 text-sm text-warn">{w}</p>)}

      <ol aria-label="Days" className="mt-8 divide-y divide-rule border-y border-rule">
        {trip.dayPlans.map((d, i) => {
          const o = outfits[i]
          return (
            <li key={d.date} className="flex items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="display text-xl">{weekday(d.date)}</div>
                <div className="mt-1 truncate text-sm text-ink-muted">{withUnit(d.note, unitFor(profile))}</div>
              </div>
              <div className="flex shrink-0 gap-1" aria-label={o ? `Outfit: ${o.garmentIds.map((g) => byId.get(g)?.name).filter(Boolean).join(', ')}` : 'No outfit'}>
                {o?.garmentIds.slice(0, 4).map((gid) => (
                  <div key={gid} className="h-10 w-10 bg-studio p-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={byId.get(gid)?.cutoutUrl} alt="" className="h-full w-full object-contain" />
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ol>

      <PackingList tripId={trip.id} items={items} limits={profile.wearLimits} />
      <div className="mt-10"><Link href="/trips" className="inline-flex min-h-11 items-center underline underline-offset-[3px]">All trips</Link></div>
    </>
  )
}
