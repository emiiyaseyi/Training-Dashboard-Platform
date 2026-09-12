import type { LucideIcon } from 'lucide-react'

export function TaStatTile({ label, value, sublabel, icon: Icon }: { label: string; value: string; sublabel?: string; icon?: LucideIcon }) {
  return (
    <div className="bg-white border border-meristem-100 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {Icon && (
          <div className="w-8 h-8 rounded-full bg-meristem-100 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-meristem-700" />
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-slate-800 tabular-nums">{value}</p>
      {sublabel && <p className="text-[11px] text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  )
}
