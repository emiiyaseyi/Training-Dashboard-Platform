export const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
] as const

export type Month = typeof MONTHS[number]

export interface PeriodFilter {
  mode: 'all' | 'year' | 'ytd' | 'range'
  year?: number
  fromMonth?: Month
  toMonth?: Month
}

export function filterLabel(f: PeriodFilter): string {
  if (f.mode === 'all') return 'All Time'
  if (f.mode === 'ytd') return `${f.year} — Year to Date`
  if (f.mode === 'year') return `Full Year ${f.year}`
  if (f.mode === 'range') return `${f.fromMonth} – ${f.toMonth} ${f.year}`
  return 'All Time'
}

export function filterToParams(f: PeriodFilter): Record<string, string> {
  if (f.mode === 'all') return {}
  const p: Record<string, string> = { filterMode: f.mode }
  if (f.year) p.year = String(f.year)
  if (f.fromMonth) p.fromMonth = f.fromMonth
  if (f.toMonth) p.toMonth = f.toMonth
  return p
}

export function filterToQuery(f: PeriodFilter): string {
  const params = filterToParams(f)
  const qs = new URLSearchParams(params).toString()
  return qs ? `?${qs}` : ''
}

/** Returns which month indices (0-based) are included by the filter */
export function activeMonthIndices(f: PeriodFilter): number[] | null {
  if (f.mode === 'all' || f.mode === 'year') return null  // null = all months

  const now = new Date()
  const currentMonthIdx = now.getMonth()

  if (f.mode === 'ytd') {
    return Array.from({ length: currentMonthIdx + 1 }, (_, i) => i)
  }
  if (f.mode === 'range' && f.fromMonth && f.toMonth) {
    const from = MONTHS.indexOf(f.fromMonth as Month)
    const to = MONTHS.indexOf(f.toMonth as Month)
    if (from === -1 || to === -1) return null
    const indices: number[] = []
    for (let i = from; i <= to; i++) indices.push(i)
    return indices
  }
  return null
}
