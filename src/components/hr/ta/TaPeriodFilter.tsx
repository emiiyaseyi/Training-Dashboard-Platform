'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { FilterBar } from '@/components/ui/FilterBar'
import { parsePeriodFilterFromParams, periodToDateRange, filterToParams, type PeriodFilter } from '@/lib/filter-types'

/** The Period popover (All Time/Year to Date/Full Year/Month Range), placed in the page header's
 * top-right actions slot — same position as L&D's and Talent Management's FilterBar — rather than
 * inside TaFilterBar's filter card, which now holds only the Business Unit/Role/Office selects.
 * Resolves the abstract PeriodFilter to concrete from/to ISO dates for ta-filters.ts's existing
 * requisitionStartDate filtering, while also writing filterMode/year/fromMonth/toMonth so
 * reopening the popover after a reload shows the right preset selected. */
export function TaPeriodFilter({ availableYears = [] }: { availableYears?: number[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setPeriod(f: PeriodFilter) {
    const params = new URLSearchParams(searchParams.toString())
    for (const k of ['filterMode', 'year', 'fromMonth', 'toMonth', 'from', 'to']) params.delete(k)
    for (const [k, v] of Object.entries(filterToParams(f))) params.set(k, v)
    const { from, to } = periodToDateRange(f)
    if (from) params.set('from', from.toISOString().slice(0, 10))
    if (to) params.set('to', to.toISOString().slice(0, 10))
    router.push(`?${params.toString()}`)
  }

  const period = parsePeriodFilterFromParams(searchParams)

  return <FilterBar availableYears={availableYears} value={period} onChange={setPeriod} />
}
