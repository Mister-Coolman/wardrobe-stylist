import Link from 'next/link'
import type { DayContext } from '@/lib/rules/types'

/** One line of text with tabular numbers, not stat cards (style guide §6). */
export function DayStrip({ day, calendarConnected }: { day: DayContext; calendarConnected: boolean }) {
  const w = day.weather
  const parts: string[] = []
  if (w.summary !== 'unknown') parts.push(`${w.tempHighC}° → ${w.tempLowC}°`, w.summary)
  for (const e of day.events) {
    if (e.allDay) parts.push(e.title)
    else parts.push(`${e.start ? `${e.start} ` : ''}${e.title}${e.source === 'user' ? ' (added)' : ''}`)
  }
  return (
    <p data-testid="day-strip" className="mt-2 text-sm text-ink-muted tnum">
      {parts.join(' · ')}
      {!calendarConnected && (
        <>
          {parts.length ? ' · ' : ''}Calendar not connected{' '}
          <Link href="/onboarding?connect=1" className="text-ink underline underline-offset-[3px]">Connect</Link>
        </>
      )}
    </p>
  )
}
