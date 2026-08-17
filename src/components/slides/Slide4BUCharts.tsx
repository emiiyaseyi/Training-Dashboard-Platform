import { SlideShell } from './SlideShell'
import { BarChart } from '@/components/charts/BarChart'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide4BUCharts({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  const bus = data.businessUnits
  return (
    <SlideShell title="Investment & Coverage by Business Unit" subtitle="Total learning spend (₦) and % of staff trained, per entity" pageNumber={pageNumber} periodLabel={periodLabel}>
      <div className="grid grid-cols-2 gap-4 h-full">
        <div className="rounded-xl border border-navy-200 bg-navy-100 p-5">
          <h3 className="text-sm font-semibold text-navy-600 mb-2">Total Investment by Business Unit (₦M)</h3>
          <BarChart
            labels={bus.map((b) => b.name)}
            values={bus.map((b) => b.totalInvestment / 1_000_000)}
            color="#1E2761"
            height={Math.max(420, bus.length * 48)}
            horizontal
            showLabels
            labelFormatter={(v) => v.toFixed(1)}
          />
        </div>
        <div className="rounded-xl border border-navy-200 bg-navy-100 p-5">
          <h3 className="text-sm font-semibold text-navy-600 mb-2">Staff Coverage by Business Unit (%)</h3>
          <BarChart
            labels={bus.map((b) => b.name)}
            values={bus.map((b) => b.coverageRatio)}
            color="#1F9D6C"
            height={Math.max(420, bus.length * 48)}
            horizontal
            showLabels
            labelSuffix="%"
          />
        </div>
      </div>
    </SlideShell>
  )
}
