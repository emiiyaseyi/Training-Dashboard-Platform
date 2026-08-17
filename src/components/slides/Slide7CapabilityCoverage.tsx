import { SlideShell } from './SlideShell'
import { BarChart } from '@/components/charts/BarChart'
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
        <div className="rounded-xl border border-navy-200 bg-navy-100 p-5 h-full">
          <BarChart
            labels={coverage.map((c) => c.capability)}
            values={coverage.map((c) => c.coverageRatio)}
            color="#1E2761"
            height={Math.max(460, coverage.length * 60)}
            horizontal
            showLabels
            labelSuffix="%"
          />
        </div>
      )}
    </SlideShell>
  )
}
