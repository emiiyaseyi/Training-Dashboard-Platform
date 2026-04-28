import type { LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'

interface KPICardProps {
  title: string
  value: string
  subtitle?: string
  icon: ComponentType<LucideProps>
  color: 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'slate'
  trend?: { value: number; label: string }
  alert?: boolean
}

const colorMap = {
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   value: 'text-blue-700' },
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',  value: 'text-green-700' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600',value: 'text-purple-700' },
  amber:  { bg: 'bg-amber-50',  icon: 'bg-amber-100 text-amber-600',  value: 'text-amber-700' },
  red:    { bg: 'bg-red-50',    icon: 'bg-red-100 text-red-600',      value: 'text-red-700' },
  slate:  { bg: 'bg-slate-50',  icon: 'bg-slate-100 text-slate-600',  value: 'text-slate-700' },
}

export function KPICard({ title, value, subtitle, icon: Icon, color, trend, alert }: KPICardProps) {
  const c = colorMap[color]
  return (
    <div className={`rounded-xl border ${alert ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'} p-5 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${alert ? 'bg-red-100 text-red-600' : c.icon}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            trend.value >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className={`text-2xl font-bold tabular-nums mt-0.5 ${alert ? 'text-red-700' : c.value}`}>
          {value}
        </p>
        {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}
