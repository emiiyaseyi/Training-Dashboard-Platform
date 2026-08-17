import { SlideShell } from './SlideShell'
import { PieChart } from '@/components/charts/PieChart'
import { LineChart } from '@/components/charts/LineChart'
import { fmt, pct } from '@/lib/slide-format'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide3InvestmentSplit({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  return (
    <SlideShell title="Where the Investment Goes" subtitle={`Spend split and monthly formal training trend, ${periodLabel}`} pageNumber={pageNumber} periodLabel={periodLabel}>
      <div className="grid grid-cols-3 gap-4 h-full">
        <div className="rounded-xl border border-navy-200 bg-navy-100 p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-navy-600 mb-2">Investment Split</h3>
          <PieChart labels={['Formal Training', 'Strategic Initiatives', 'Subscriptions']} values={[data.totalTrainingCost, data.totalOtherTrainingCost, data.totalSubscriptionCost]} donut height={340} showLegend={false} />
          <div className="grid grid-cols-1 gap-2 mt-3 text-xs">
            <div><span className="font-bold text-navy-600">{fmt(data.totalTrainingCost)}</span> <span className="text-report-gray">Formal Training ({pct(data.trainingSharePct)})</span></div>
            <div><span className="font-bold text-gold-400">{fmt(data.totalOtherTrainingCost)}</span> <span className="text-report-gray">Strategic Initiatives ({pct(data.otherSharePct)})</span></div>
            <div><span className="font-bold text-report-green">{fmt(data.totalSubscriptionCost)}</span> <span className="text-report-gray">Subscriptions ({pct(data.subscriptionSharePct)})</span></div>
          </div>
        </div>
        <div className="col-span-2 rounded-xl border border-navy-200 bg-navy-100 p-5">
          <h3 className="text-sm font-semibold text-navy-600 mb-2">Monthly Formal Training Spend (₦)</h3>
          <LineChart labels={data.monthlySpend.map((m) => m.month)} values={data.monthlySpend.map((m) => m.cost)} height={420} />
        </div>
      </div>
    </SlideShell>
  )
}
