export const PAGE_KEYS = [
  'executive-overview',
  'training-analytics',
  'subscriptions',
  'business-units',
  'capability-coverage',
  'yet-to-attend',
  'report-generation',
  'upload-data',
  'admin-settings',
] as const

export type PageKey = (typeof PAGE_KEYS)[number]

export const PAGE_LABELS: Record<PageKey, string> = {
  'executive-overview': 'Executive Overview',
  'training-analytics': 'Training Analytics',
  subscriptions: 'Subscriptions',
  'business-units': 'Business Units',
  'capability-coverage': 'Capability Coverage',
  'yet-to-attend': 'Yet to Attend Training',
  'report-generation': 'Report Generation',
  'upload-data': 'Upload & Data',
  'admin-settings': 'Admin Settings',
}

export const PAGE_ROUTES: Record<PageKey, string> = {
  'executive-overview': '/',
  'training-analytics': '/training',
  subscriptions: '/subscriptions',
  'business-units': '/business-units',
  'capability-coverage': '/capabilities',
  'yet-to-attend': '/yet-to-attend',
  'report-generation': '/reports',
  'upload-data': '/upload',
  'admin-settings': '/admin',
}

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
