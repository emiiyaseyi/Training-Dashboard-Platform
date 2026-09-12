import type { LucideIcon } from 'lucide-react'

const RADIUS = 26
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Ported concept from the source repo's RingStat (components/ui/CircularStat.tsx) — an
 * offer-acceptance / withdrawal-rate style single-percentage ring. */
export function TaRingStat({ percent, label, sublabel, color = '#2F6B2B', icon: Icon }: { percent: number | null; label: string; sublabel?: string; color?: string; icon?: LucideIcon }) {
  const pct = percent == null ? 0 : Math.max(0, Math.min(1, percent))
  const offset = CIRCUMFERENCE * (1 - pct)

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <svg width="56" height="56" viewBox="0 0 56 56" className="absolute inset-0 -rotate-90">
          <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="#E7EFE3" strokeWidth="5" />
          <circle cx="28" cy="28" r={RADIUS} fill="none" stroke={color} strokeWidth="5" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        {Icon && <Icon size={18} strokeWidth={2} style={{ color }} />}
      </div>
      <div>
        <div className="text-base font-bold text-slate-800 tabular-nums">{percent == null ? '—' : `${(percent * 100).toFixed(0)}%`}</div>
        <div className="text-xs text-slate-600">{label}</div>
        {sublabel && <div className="text-[10px] text-slate-400">{sublabel}</div>}
      </div>
    </div>
  )
}
