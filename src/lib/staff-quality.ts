import { prisma } from '@/lib/prisma'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import type { StaffRosterRecord } from '@prisma/client'

export interface StaffQualityRow {
  id: string
  staffId: string
  name: string
  firstName: string
  middleName: string | null
  lastName: string
  email: string | null
  businessUnit: string
  lineManagerStaffId: string | null
  role: string | null
  department: string | null
  issues: string[]
}

export interface DuplicateIdGroup {
  key: string
  staffId: string
  keep: { id: string; name: string; businessUnit: string; createdAt: string }
  shadowed: { id: string; name: string; businessUnit: string; createdAt: string }[]
}

export interface StaffQualityAudit {
  rows: StaffQualityRow[]
  flaggedCount: number
  totalStaff: number
  duplicateIdGroups: DuplicateIdGroup[]
  duplicateNameGroups: { name: string; staffIds: string[] }[]
}

// Roster uploads accumulate over time (same "most recent row per Staff ID wins" convention as
// loadRosterDirectory / roster-analytics.ts) — audits and edits act on the latest row per staff.
export async function auditStaffQuality(): Promise<StaffQualityAudit> {
  const all = await prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } })

  const groups = new Map<string, StaffRosterRecord[]>()
  for (const r of all) {
    const key = normalizeStaffIdKey(r.staffId) || `__blank_${r.id}`
    const list = groups.get(key) || []
    list.push(r)
    groups.set(key, list)
  }

  const rows: StaffQualityRow[] = []
  const duplicateIdGroups: DuplicateIdGroup[] = []
  const emailSeen = new Map<string, string[]>() // lowercased email -> staffIds
  const nameSeen = new Map<string, string[]>() // lowercased full name -> staffIds

  for (const [key, list] of groups) {
    const latest = list[list.length - 1]
    const name = [latest.firstName, latest.middleName, latest.lastName].filter(Boolean).join(' ').trim()
    const issues: string[] = []

    if (!latest.staffId.trim()) issues.push('Missing Staff ID')
    if (!latest.firstName.trim() || !latest.lastName.trim()) issues.push('Missing name')
    if (!latest.email?.trim()) issues.push('Missing email')
    if (!latest.businessUnit.trim()) issues.push('Missing Business Unit')
    if (latest.lineManagerStaffId && normalizeStaffIdKey(latest.lineManagerStaffId) === key) {
      issues.push('Line manager is set to self')
    }

    rows.push({
      id: latest.id,
      staffId: latest.staffId,
      name,
      firstName: latest.firstName,
      middleName: latest.middleName,
      lastName: latest.lastName,
      email: latest.email,
      businessUnit: latest.businessUnit,
      lineManagerStaffId: latest.lineManagerStaffId,
      role: latest.role,
      department: latest.department,
      issues,
    })

    if (list.length > 1) {
      duplicateIdGroups.push({
        key,
        staffId: latest.staffId,
        keep: { id: latest.id, name, businessUnit: latest.businessUnit, createdAt: latest.createdAt.toISOString() },
        shadowed: list.slice(0, -1).map((r) => ({
          id: r.id,
          name: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ').trim(),
          businessUnit: r.businessUnit,
          createdAt: r.createdAt.toISOString(),
        })),
      })
    }

    if (latest.email?.trim()) {
      const e = latest.email.trim().toLowerCase()
      emailSeen.set(e, [...(emailSeen.get(e) || []), latest.staffId])
    }
    if (name) {
      const n = name.toLowerCase()
      nameSeen.set(n, [...(nameSeen.get(n) || []), latest.staffId])
    }
  }

  // Cross-record checks that need the full set: duplicate email/name across DIFFERENT Staff IDs.
  for (const [email, staffIds] of emailSeen) {
    const distinctIds = [...new Set(staffIds)]
    if (distinctIds.length > 1) {
      for (const row of rows) {
        if (row.email?.trim().toLowerCase() === email) row.issues.push(`Email shared with ${distinctIds.length - 1} other staff record(s)`)
      }
    }
  }

  const duplicateNameGroups = [...nameSeen.entries()]
    .filter(([, ids]) => new Set(ids).size > 1)
    .map(([name, ids]) => ({ name, staffIds: [...new Set(ids)] }))

  const flagged = rows.filter((r) => r.issues.length > 0)

  return {
    rows: flagged.sort((a, b) => b.issues.length - a.issues.length),
    flaggedCount: flagged.length,
    totalStaff: rows.length,
    duplicateIdGroups,
    duplicateNameGroups,
  }
}

// Deletes the shadowed (older) rows in every duplicate-Staff-ID group, keeping only the most
// recent row per Staff ID. Safe/idempotent — re-running finds nothing left to clean.
export async function cleanDuplicateStaffRecords(): Promise<number> {
  const { duplicateIdGroups } = await auditStaffQuality()
  const idsToDelete = duplicateIdGroups.flatMap((g) => g.shadowed.map((s) => s.id))
  if (idsToDelete.length === 0) return 0
  await prisma.staffRosterRecord.deleteMany({ where: { id: { in: idsToDelete } } })
  return idsToDelete.length
}
