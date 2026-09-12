// Talent Acquisition — ported from github.com/emiiyaseyi/Talent-Recruitment-Dashboard
// (lib/filters.ts), unchanged.

import type { Filters } from './ta-types'

export type SearchParams = Record<string, string | string[] | undefined>

export function parseFilters(sp: SearchParams): Filters {
  const get = (key: string): string | undefined => {
    const v = sp[key]
    return typeof v === 'string' && v ? v : undefined
  }
  const from = get('from')
  const to = get('to')
  return {
    from: from ? new Date(from) : null,
    to: to ? new Date(to) : null,
    bu: get('bu') ?? null,
    role: get('role') ?? null,
    officeType: get('officeType') ?? null,
  }
}
