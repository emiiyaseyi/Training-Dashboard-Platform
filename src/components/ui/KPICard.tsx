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

// Value text color per semantic category — icon badge stays a constant navy circle (matches the report deck)
const valueColorMap = {
  blue:   'text-navy-600',
  green:  'text-report-green',
  purple: 'text-navy-600',
  amber:  'text-gold-400',
  red:    'text-report-red',
  slate:  'text-navy-400',
}

export function KPICard({ title, value, subtitle, icon: Icon, color, trend, alert }: KPICardProps) {
  return (
    <div className={`rounded-xl border ${alert ? 'border-red-200 bg-red-50' : 'border-navy-100 bg-white'} p-5 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${alert ? 'bg-report-red' : 'bg-navy-700'}`}>
          <Icon className="w-4.5 h-4.5 text-white" />
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
        <p className="text-sm text-navy-600 font-medium">{title}</p>
        <p className={`text-2xl font-serif font-bold tabular-nums mt-0.5 ${alert ? 'text-report-red' : valueColorMap[color]}`}>
          {value}
        </p>
        {subtitle && <p className="text-xs text-report-gray mt-1">{subtitle}</p>}
      </div>
    </div>
  )
}
