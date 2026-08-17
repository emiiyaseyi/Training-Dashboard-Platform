import { SlideShell } from './SlideShell'
import { SlideBUProfileCard } from './SlideBUProfileCard'
import type { GroupAnalytics } from '@/lib/analytics'

export function Slide6BUProfiles({ data, pageNumber, periodLabel }: { data: GroupAnalytics; pageNumber: number; periodLabel: string }) {
  const rest = data.businessUnits.slice(4, 8)
  return (
    <SlideShell title="Business Unit Profiles" subtitle="Remaining entities across the group" pageNumber={pageNumber} periodLabel={periodLabel}>
      <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
        {rest.map((bu) => <SlideBUProfileCard key={bu.name} bu={bu} />)}
      </div>
    </SlideShell>
  )
}
