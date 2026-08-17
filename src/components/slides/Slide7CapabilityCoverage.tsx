import { SlideShell } from './SlideShell'
import { HorizontalBarList } from '@/components/charts/HorizontalBarList'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide7CapabilityCoverage({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  const coverage = data.capabilityCoverage
  return (
    <SlideShell title="Differentiating Capabilities Coverage" subtitle="Share of total staff trained against each strategic capability" pageNumber={pageNumber} periodLabel={periodLabel}>
      {coverage.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-report-gray">
          No Differentiating Capabilities configured yet — add them in Admin.
        </div>
      ) : (
        <div className="rounded-xl border border-navy-200 bg-navy-100 p-5 h-full flex flex-col justify-center">
          <HorizontalBarList
            labels={coverage.map((c) => c.capability)}
            values={coverage.map((c) => Math.round(c.coverageRatio * 10) / 10)}
            color="#1E2761"
            labelSuffix="%"
            maxValue={100}
            labelColWidth={260}
            barHeight={36}
            rowGap={40}
          />
        </div>
      )}
    </SlideShell>
  )
}
