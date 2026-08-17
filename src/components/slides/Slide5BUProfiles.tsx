import { SlideShell } from './SlideShell'
import { SlideBUProfileCard } from './SlideBUProfileCard'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide5BUProfiles({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  const top4 = data.businessUnits.slice(0, 4)
  return (
    <SlideShell title="Business Unit Profiles" subtitle="Top performing entities by total investment" pageNumber={pageNumber} periodLabel={periodLabel}>
      <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
        {top4.map((bu) => <SlideBUProfileCard key={bu.name} bu={bu} />)}
      </div>
    </SlideShell>
  )
}
