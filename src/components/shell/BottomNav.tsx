'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChatCircle, CoatHanger, Suitcase, Sun } from '@phosphor-icons/react'

const ITEMS = [
  { href: '/stylist', label: 'Stylist', Icon: ChatCircle },
  { href: '/today', label: 'Today', Icon: Sun },
  { href: '/closet', label: 'Closet', Icon: CoatHanger },
  { href: '/trips', label: 'Trips', Icon: Suitcase },
]

export function BottomNav() {
  const path = usePathname()
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-[560px]">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = path === href || path.startsWith(`${href}/`)
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-sm ${active ? 'text-accent font-semibold' : 'text-ink-muted'}`}>
                <Icon size={24} weight="light" aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
