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

/** Resolves a PeriodFilter down to a concrete [from, to] Date range — for callers (like Talent
 * Acquisition) that filter records against a continuous date range rather than matching discrete
 * month/year buckets the way activeMonthIndices()'s consumers do. `to` is end-of-day so a record
 * dated on the boundary day itself is included. */
export function periodToDateRange(f: PeriodFilter): { from: Date | null; to: Date | null } {
  if (f.mode === 'all') return { from: null, to: null }
  const now = new Date()
  const year = f.year ?? currentYear()
  if (f.mode === 'year') return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59, 999) }
  if (f.mode === 'ytd') return { from: new Date(year, 0, 1), to: now }
  if (f.mode === 'range') {
    const fromIdx = MONTHS.indexOf((f.fromMonth ?? 'January') as Month)
    const toIdx = MONTHS.indexOf((f.toMonth ?? currentMonthName()) as Month)
    return { from: new Date(year, fromIdx, 1), to: new Date(year, toIdx + 1, 0, 23, 59, 59, 999) }
  }
  return { from: null, to: null }
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
