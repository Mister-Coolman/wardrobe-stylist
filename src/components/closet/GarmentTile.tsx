import type { Garment } from '@/lib/domain/types'

/** Cutout on studio gray, radius 0, no shadow; name under it, status as a word. */
export function GarmentTile({ garment, status, meta, onOpen, index = 0, settle = false }:
  { garment: Garment; status?: string | null; meta?: string; onOpen?: () => void; index?: number; settle?: boolean }) {
  return (
    <button type="button" onClick={onOpen} aria-label={`${garment.name}${status ? `, ${status}` : ''}`}
      className={`press block w-full text-left ${settle ? 'settle-in' : ''}`} style={settle ? { animationDelay: `${index * 40}ms` } : undefined}>
      <div className="aspect-square bg-studio p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={garment.cutoutUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
      </div>
      <div className="mt-2 text-sm font-medium leading-tight">{garment.name}</div>
      {meta && <div className="label mt-1 text-ink-muted">{meta}</div>}
      {status && <div className="mt-1 text-xs text-ink-muted tnum">{status}</div>}
    </button>
  )
}
