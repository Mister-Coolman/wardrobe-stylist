import Link from 'next/link'
import type { Category } from '@/lib/domain/types'
import { CATEGORY_PLURAL } from '@/lib/ui/format'

export function MissingPieces({ missing, closetEmpty }: { missing: Category[]; closetEmpty: boolean }) {
  const list = missing.map((c) => CATEGORY_PLURAL[c])
  const words = list.length > 1 ? `${list.slice(0, -1).join(', ')} or ${list.at(-1)}` : list[0]
  const line = closetEmpty ? 'Your closet is empty. Scan it in a minute.'
    : missing.length === 1 && missing[0] === 'shoes' ? 'No shoes yet — scan a pair to get outfits.'
    : `No clean ${words} right now — scan a few more, or it’s laundry day.`
  return (
    <div className="flex min-h-[50dvh] flex-col items-start justify-center gap-6">
      <p className="display text-2xl">{line}</p>
      <Link href="/scan" className="press inline-flex h-12 items-center rounded-control bg-accent px-6 font-semibold text-paper">Scan closet</Link>
    </div>
  )
}
