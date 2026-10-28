'use client'
import type { WearLimits } from '@/lib/domain/types'

export const LIMIT_ROWS: [keyof WearLimits, string][] = [
  ['tshirt', 'T-shirts'], ['shirt', 'Shirts'], ['dress_shirt', 'Dress shirts'], ['sweater', 'Sweaters'], ['jeans', 'Jeans'],
  ['trousers', 'Trousers'], ['sweatpants', 'Sweatpants'], ['athletic', 'Athletic'], ['underwear', 'Underwear'], ['socks', 'Socks'],
]

/** Wears before a wash, per kind of clothing. Empty = no limit. */
export function WearLimitsEditor({ value, onChange }: { value: WearLimits; onChange: (v: WearLimits) => void }) {
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {LIMIT_ROWS.map(([k, label]) => (
        <li key={k} className="flex min-h-14 items-center justify-between gap-4">
          <label htmlFor={`limit-${k}`} className="flex-1">{label}</label>
          <input id={`limit-${k}`} aria-label={label} type="number" inputMode="numeric" min={1} max={30}
            className="input w-24 text-right tnum" placeholder="No limit"
            value={value[k] ?? ''}
            onChange={(e) => onChange({ ...value, [k]: e.target.value === '' ? null : Math.max(1, Math.min(30, Number(e.target.value))) })} />
        </li>
      ))}
    </ul>
  )
}
