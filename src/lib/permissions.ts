export const PAGE_KEYS = [
  'executive-overview',
  'training-analytics',
  'subscriptions',
  'business-units',
  'capability-coverage',
  'yet-to-attend',
  'talent-members',
  'report-generation',
  'upload-data',
  'admin-settings',
  // HR Dashboard — a separate section (own layout/sidebar, see src/app/hr) sitting alongside the
  // Learning Intelligence pages above, not replacing them. 'hr-summary' gates the cross-unit
  // rollup page; each unit below gates that unit's own full report. 'hr-learning-development'
  // is deliberately separate from the existing L&D page keys above — it only gates whether the
  // L&D tile/summary shows up in HR context, not access to Learning Intelligence itself, since
  // the two audiences (someone who just needs the HR rollup vs. someone administering L&D) don't
  // have to overlap.
  'hr-summary',
  'hr-employee-services',
  'hr-talent-acquisition',
  'hr-learning-development',
  'hr-performance-management',
  'hr-compensation-benefits',
] as const

export type PageKey = (typeof PAGE_KEYS)[number]

export const PAGE_LABELS: Record<PageKey, string> = {
  'executive-overview': 'Executive Overview',
  'training-analytics': 'Training Analytics',
  subscriptions: 'Subscriptions',
  'business-units': 'Business Units',
  'capability-coverage': 'Capability Coverage',
  'yet-to-attend': 'Yet to Attend Training',
  'talent-members': 'Talent Members',
  'report-generation': 'Report Generation',
  'upload-data': 'Upload & Data',
  'admin-settings': 'Admin Settings',
  'hr-summary': 'HR Summary',
  'hr-employee-services': 'HR — Employee Services',
  'hr-talent-acquisition': 'HR — Talent Acquisition',
  'hr-learning-development': 'HR — Learning & Development',
  'hr-performance-management': 'HR — Performance Management',
  'hr-compensation-benefits': 'HR — Compensation & Benefits',
}

export const PAGE_ROUTES: Record<PageKey, string> = {
  'executive-overview': '/',
  'training-analytics': '/training',
  subscriptions: '/subscriptions',
  'business-units': '/business-units',
  'capability-coverage': '/capabilities',
  'yet-to-attend': '/yet-to-attend',
  'talent-members': '/talent-members',
  'report-generation': '/reports',
  'upload-data': '/upload',
  'admin-settings': '/admin',
  'hr-summary': '/hr',
  'hr-employee-services': '/hr/employee-services',
  'hr-talent-acquisition': '/hr/talent-acquisition',
  'hr-learning-development': '/hr/learning-development',
  'hr-performance-management': '/hr/performance-management',
  'hr-compensation-benefits': '/hr/compensation-benefits',
}

// The 5 HR units + the summary page, as a single ordered list — driving the HR sidebar nav and
// the unit tiles on the summary page, so both always stay in sync with each other and with
// PAGE_KEYS/PAGE_ROUTES above (one list to edit, not three).
export const HR_UNIT_KEYS = [
  'hr-employee-services',
  'hr-talent-acquisition',
  'hr-learning-development',
  'hr-performance-management',
  'hr-compensation-benefits',
] as const satisfies readonly PageKey[]

export const PERMISSION_LEVELS = ['view', 'view-export', 'admin'] as const
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

export const PERMISSION_LEVEL_LABELS: Record<PermissionLevel, string> = {
  view: 'View only',
  'view-export': 'View + Download/Export',
  admin: 'Admin rights',
}

const LEVEL_RANK: Record<PermissionLevel, number> = { view: 1, 'view-export': 2, admin: 3 }

export function hasAccess(level: string | undefined | null, required: PermissionLevel): boolean {
  if (!level || !(level in LEVEL_RANK)) return false
  return LEVEL_RANK[level as PermissionLevel] >= LEVEL_RANK[required]
}

// Longest-matching-prefix route -> page key resolution (handles nested routes under a page).
export function pageKeyForPath(pathname: string): PageKey | null {
  if (pathname === '/') return 'executive-overview'
  const matches = (Object.entries(PAGE_ROUTES) as [PageKey, string][])
    .filter(([, route]) => route !== '/' && pathname.startsWith(route))
    .sort((a, b) => b[1].length - a[1].length)
  return matches.length ? matches[0][0] : null
}

export function normalizeStaffId(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toUpperCase()
  return trimmed ? trimmed : null
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

// User.businessUnitScope is stored as a plain string — either the literal "ALL", or a JSON
// array of BU names for multi-BU access. A bare BU name (pre-multi-select data) is treated as
// a single-item list for backward compatibility.
export function parseBUScope(raw: string | null | undefined): string[] | 'ALL' {
  if (!raw || raw === 'ALL') return 'ALL'
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return parsed.length === 0 ? 'ALL' : parsed
    }
  } catch {
    // not JSON — legacy plain BU name
  }
  return [raw]
}

export function serializeBUScope(scope: string[] | 'ALL'): string {
  if (scope === 'ALL' || (Array.isArray(scope) && scope.length === 0)) return 'ALL'
  return JSON.stringify(scope)
}
