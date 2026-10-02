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

function currentYear() { return new Date().getFullYear() }
function currentMonthName(): Month { return MONTHS[new Date().getMonth()] }

/** Human-readable label — never shows "undefined" */
export function filterLabel(f: PeriodFilter): string {
  const y = f.year ?? currentYear()
  const from = f.fromMonth ?? 'January'
  const to = f.toMonth ?? currentMonthName()
  if (f.mode === 'all')   return 'All Time'
  if (f.mode === 'ytd')   return `${y} — Year to Date`
  if (f.mode === 'year')  return `Full Year ${y}`
  if (f.mode === 'range') return `${from} – ${to} ${y}`
  return 'All Time'
}

/** Produce defaults for any missing fields so the API never receives undefined */
export function resolveFilter(f: PeriodFilter): PeriodFilter {
  if (f.mode === 'all') return f
  return {
    ...f,
    year:      f.year      ?? currentYear(),
    fromMonth: f.fromMonth ?? 'January',
    toMonth:   f.toMonth   ?? currentMonthName(),
  }
}

export function filterToParams(f: PeriodFilter): Record<string, string> {
  const r = resolveFilter(f)
  if (r.mode === 'all') return {}
  const p: Record<string, string> = { filterMode: r.mode }
  if (r.year)      p.year      = String(r.year)
  if (r.fromMonth) p.fromMonth = r.fromMonth
  if (r.toMonth)   p.toMonth   = r.toMonth
  return p
}

export function filterToQuery(f: PeriodFilter): string {
  const params = filterToParams(f)
  const qs = new URLSearchParams(params).toString()
  return qs ? `?${qs}` : ''
}

// Shared parsing for any API route that accepts the same filterMode/year/fromMonth/toMonth query
// params the FilterBar sends — avoids re-writing this exact block in every route.
export function parsePeriodFilterFromParams(sp: URLSearchParams): PeriodFilter {
  const mode = (sp.get('filterMode') ?? 'all') as PeriodFilter['mode']
  const validModes: PeriodFilter['mode'][] = ['all', 'year', 'ytd', 'range']
  const year = sp.get('year') ? parseInt(sp.get('year')!) : undefined
  const fromMonth = (sp.get('fromMonth') as PeriodFilter['fromMonth']) ?? undefined
  const toMonth = (sp.get('toMonth') as PeriodFilter['toMonth']) ?? undefined

  return {
    mode: validModes.includes(mode) ? mode : 'all',
    year,
    fromMonth: fromMonth && MONTHS.includes(fromMonth as Month) ? fromMonth : undefined,
    toMonth: toMonth && MONTHS.includes(toMonth as Month) ? toMonth : undefined,
  }
}

export function activeMonthIndices(f: PeriodFilter): number[] | null {
  if (f.mode === 'all' || f.mode === 'year') return null
  const now = new Date()
  if (f.mode === 'ytd') {
    return Array.from({ length: now.getMonth() + 1 }, (_, i) => i)
  }
  if (f.mode === 'range' && f.fromMonth && f.toMonth) {
    const from = MONTHS.indexOf(f.fromMonth as Month)
    const to   = MONTHS.indexOf(f.toMonth   as Month)
    if (from === -1 || to === -1) return null
    return Array.from({ length: to - from + 1 }, (_, i) => from + i)
  }
  return null
}
