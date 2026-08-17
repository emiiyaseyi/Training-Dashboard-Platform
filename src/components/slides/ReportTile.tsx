import type { LucideProps } from 'lucide-react'
import type { ComponentType } from 'react'

interface ReportTileProps {
  icon: ComponentType<LucideProps>
  title: string
  value: string
  subtitle?: string
  valueColor?: string
}

// Compact KPI tile for the slide deck — same visual language as KPICard, denser footprint so a
// full row fits a fixed 16:9 canvas without scrolling.
export function ReportTile({ icon: Icon, title, value, subtitle, valueColor = 'text-navy-600' }: ReportTileProps) {
  return (
    <div className="rounded-xl border border-navy-100 bg-white flex flex-col overflow-hidden" style={{ padding: 14 }}>
      <div className="rounded-full bg-navy-700 flex items-center justify-center shrink-0" style={{ width: 28, height: 28, marginBottom: 6 }}>
        <Icon className="text-white" style={{ width: 14, height: 14 }} />
      </div>
      <p className="text-navy-600 font-medium" style={{ fontSize: 17, lineHeight: '20px' }}>{title}</p>
      <p className={`font-serif font-bold tabular-nums ${valueColor}`} style={{ fontSize: 34, lineHeight: '38px', marginTop: 2 }}>{value}</p>
      {subtitle && (
        <p
          className="text-report-gray overflow-hidden"
          style={{ fontSize: 13, lineHeight: '16px', marginTop: 4, maxHeight: 32, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
