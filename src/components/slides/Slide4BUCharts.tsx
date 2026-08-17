import { SlideShell } from './SlideShell'
import { HorizontalBarList } from '@/components/charts/HorizontalBarList'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide4BUCharts({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  const bus = data.businessUnits // already sorted by totalInvestment desc
  const busByCoverage = [...data.businessUnits].sort((a, b) => b.coverageRatio - a.coverageRatio)
  return (
    <SlideShell title="Investment & Coverage by Business Unit" subtitle="Total learning spend (₦) and % of staff trained, per entity" pageNumber={pageNumber} periodLabel={periodLabel}>
      <div className="grid grid-cols-2 gap-4 h-full">
        <div className="rounded-xl border border-navy-200 bg-navy-100 p-5 h-full flex flex-col">
          <h3 className="text-sm font-semibold text-navy-600 mb-4 shrink-0">Total Investment by Business Unit (₦M)</h3>
          <div className="flex-1 flex flex-col justify-center">
            <HorizontalBarList
              labels={bus.map((b) => b.name)}
              values={bus.map((b) => Math.round((b.totalInvestment / 1_000_000) * 10) / 10)}
              color="#1E2761"
              labelColWidth={190}
              barHeight={28}
              rowGap={22}
            />
          </div>
        </div>
        <div className="rounded-xl border border-navy-200 bg-navy-100 p-5 h-full flex flex-col">
          <h3 className="text-sm font-semibold text-navy-600 mb-4 shrink-0">Staff Coverage by Business Unit (%)</h3>
          <div className="flex-1 flex flex-col justify-center">
            <HorizontalBarList
              labels={busByCoverage.map((b) => b.name)}
              values={busByCoverage.map((b) => Math.round(b.coverageRatio * 10) / 10)}
              color="#1F9D6C"
              labelSuffix="%"
              maxValue={100}
              labelColWidth={190}
              barHeight={28}
              rowGap={22}
            />
          </div>
        </div>
      </div>
    </SlideShell>
  )
}
