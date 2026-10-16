import { prisma } from '@/lib/prisma'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { getLiveRosterStaffIdKeys } from '@/lib/sheets-sync'
import { buildFullName } from '@/lib/staff-name'
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

// One candidate person within a "same name, different Staff IDs" group — almost always the same
// real person uploaded under two different Staff ID spellings/schemes (the exact class of issue
// the earlier Staff ID reconciliation work was fixing by hand). Sorted newest-first per group so
// the UI can default to "the most recent upload is who this person actually is" without guessing.
export interface DuplicateNameCandidate {
  id: string
  staffId: string
  name: string
  email: string | null
  businessUnit: string
  role: string | null
  department: string | null
  createdAt: string
}

export interface DuplicateNameGroup {
  name: string
  candidates: DuplicateNameCandidate[] // [0] is the newest — the suggested "keep this one"
}

// A staff member whose current email doesn't look like it was built from their own name, using
// the company's firstnamelastname@domain convention — the exact class of bug that produces
// swapped-email rows (two people's Email cells accidentally copy-pasted into the wrong rows).
// suggestedEmail is a best-guess reconstruction (editable before accepting, not auto-applied).
export interface EmailMismatchRow {
  id: string
  staffId: string
  name: string
  currentEmail: string
  suggestedEmail: string
  businessUnit: string
  // If the CURRENT (wrong-looking) email actually matches some OTHER active staff member's own
  // name pattern, that's a strong signal of exactly this kind of two-person swap — surfaced so
  // the admin doesn't have to go hunt for who it really belongs to.
  possibleOwner: { staffId: string; name: string } | null
}

export interface StaffQualityAudit {
  rows: StaffQualityRow[]
  flaggedCount: number
  totalStaff: number
  duplicateIdGroups: DuplicateIdGroup[]
  duplicateNameGroups: DuplicateNameGroup[]
  emailMismatches: EmailMismatchRow[]
}

// letters-only, lowercased — names never legitimately contain digits, so digits are never part of
// the "expected" pattern (but ARE kept when reading the real email, see actualLocalPart, so a
// deliberate numeric disambiguation suffix like "johnsmith2@" isn't flagged as a mismatch).
function cleanNamePart(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '')
}

function expectedLocalPart(firstName: string, lastName: string): string {
  return `${cleanNamePart(firstName)}${cleanNamePart(lastName)}`
}

function actualLocalPart(email: string): string {
  return email.trim().toLowerCase().split('@')[0].replace(/[^a-z0-9]/g, '')
}

// A numeric suffix (name collision disambiguation) is tolerated — only flagged when the email's
// local part doesn't even START with the person's own expected firstname+lastname.
function emailMatchesNamePattern(email: string, firstName: string, lastName: string): boolean {
  const expected = expectedLocalPart(firstName, lastName)
  if (!expected) return true // nothing to check a name-less record against — don't flag
  return actualLocalPart(email).startsWith(expected)
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
  const nameSeen = new Map<string, DuplicateNameCandidate[]>() // lowercased full name -> one candidate per distinct Staff ID
  // Active staff only, carried separately from `rows` (which includes inactive/exited staff too,
  // just without issues pushed for them) — the email/name pattern check below only makes sense
  // for current staff, same as every other check in this function.
  const activeRows: { id: string; staffId: string; name: string; firstName: string; lastName: string; email: string; businessUnit: string }[] = []

  for (const [key, list] of groups) {
    const latest = list[list.length - 1]
    const name = buildFullName(latest.firstName, latest.middleName, latest.lastName)
    const issues: string[] = []

    // Exited/deactivated staff (Employees page -> Deactivate, or synced from the roster sheet's
    // status column) are done being onboarded — there's no value flagging a leaver's missing
    // email or Business Unit for an admin to go fix, and doing so also blocks nothing since
    // deactivated staff are already excluded from surveys wherever attendees get resolved.
    if (latest.active) {
      if (!latest.staffId.trim()) issues.push('Missing Staff ID')
      if (!latest.firstName.trim() || !latest.lastName.trim()) issues.push('Missing name')
      if (!latest.email?.trim()) issues.push('Missing email')
      if (!latest.businessUnit.trim()) issues.push('Missing Business Unit')
      if (latest.lineManagerStaffId && normalizeStaffIdKey(latest.lineManagerStaffId) === key) {
        issues.push('Line manager is set to self')
      }
      if (latest.firstName.trim() && latest.lastName.trim() && latest.email?.trim()) {
        activeRows.push({
          id: latest.id, staffId: latest.staffId, name,
          firstName: latest.firstName, lastName: latest.lastName,
          email: latest.email, businessUnit: latest.businessUnit,
        })
      }
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
      const candidate: DuplicateNameCandidate = {
        id: latest.id, staffId: latest.staffId, name, email: latest.email,
        businessUnit: latest.businessUnit, role: latest.role, department: latest.department,
        createdAt: latest.createdAt.toISOString(),
      }
      nameSeen.set(n, [...(nameSeen.get(n) || []), candidate])
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

  // createdAt can't tell current from stale here: importRosterRows only ever inserts a NEW row
  // for a Staff ID it hasn't seen before (see its own comment), so if a sheet typo/ID gets fixed
  // and reverted back to an ID already in the DB, that correct ID's row keeps its OLD createdAt
  // while the abandoned typo'd ID's row — created more recently, back when the typo was live —
  // looks newer. Cross-checking against the live Staff Roster tab (when one is configured) tells
  // us which Staff ID is actually there right now; only fall back to the createdAt guess when
  // that check is unavailable or doesn't resolve the group unambiguously.
  const liveStaffIdKeys = await getLiveRosterStaffIdKeys()

  const duplicateNameGroups: DuplicateNameGroup[] = [...nameSeen.entries()]
    .filter(([, candidates]) => candidates.length > 1)
    .map(([name, candidates]) => {
      const byCreatedAtDesc = candidates.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      if (liveStaffIdKeys) {
        const inSheet = byCreatedAtDesc.filter((c) => liveStaffIdKeys.has(normalizeStaffIdKey(c.staffId)))
        if (inSheet.length === 1) {
          const current = inSheet[0]
          return { name, candidates: [current, ...byCreatedAtDesc.filter((c) => c.id !== current.id)] }
        }
      }
      return { name, candidates: byCreatedAtDesc }
    })

  // Email/name pattern mismatches — built from activeRows (active staff with both a usable name
  // and an email already present; missing email is its own separate issue above). The "possible
  // owner" cross-match needs every active person's expected pattern computed first, hence the
  // separate map before the flagging loop.
  const expectedPatternOwners = new Map<string, { staffId: string; name: string }>()
  for (const r of activeRows) {
    const pattern = expectedLocalPart(r.firstName, r.lastName)
    if (pattern) expectedPatternOwners.set(pattern, { staffId: r.staffId, name: r.name })
  }

  const emailMismatches: EmailMismatchRow[] = []
  for (const r of activeRows) {
    if (emailMatchesNamePattern(r.email, r.firstName, r.lastName)) continue

    const domain = r.email.includes('@') ? r.email.split('@')[1] : 'meristemng.com'
    const possible = expectedPatternOwners.get(actualLocalPart(r.email))
    emailMismatches.push({
      id: r.id,
      staffId: r.staffId,
      name: r.name,
      currentEmail: r.email,
      suggestedEmail: `${expectedLocalPart(r.firstName, r.lastName)}@${domain}`,
      businessUnit: r.businessUnit,
      possibleOwner: possible && possible.staffId !== r.staffId ? possible : null,
    })
  }

  const flagged = rows.filter((r) => r.issues.length > 0)

  return {
    rows: flagged.sort((a, b) => b.issues.length - a.issues.length),
    flaggedCount: flagged.length,
    totalStaff: rows.length,
    duplicateIdGroups,
    duplicateNameGroups,
    emailMismatches,
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

export interface MergeDuplicateNameResult {
  keepStaffId: string
  deletedRosterRows: number
  repointedRecords: number
}

// Resolves a "same name, different Staff IDs" group: deletes EVERY StaffRosterRecord row (not
// just the latest) under each losing Staff ID, and re-points any Training/Subscription/KSS/
// Manager Review record still filed under one of those losing IDs to the surviving one — same
// "propagate the ID correction everywhere, not just the flagged row" principle as
// applyTrainingRecordChange (sheets-sync.ts) uses for Training Data edits. Matches by
// normalizeStaffIdKey (not raw string equality) so a punctuation-only variant of the losing ID
// (e.g. "MSL-IT-034" for a losing "MSL-IT034") is still caught and repointed.
export async function mergeDuplicateNameGroup(keepStaffId: string, mergeStaffIds: string[]): Promise<MergeDuplicateNameResult> {
  const keepKey = normalizeStaffIdKey(keepStaffId)
  let deletedRosterRows = 0
  let repointedRecords = 0

  for (const mergeStaffId of mergeStaffIds) {
    const mergeKey = normalizeStaffIdKey(mergeStaffId)
    if (!mergeKey || mergeKey === keepKey) continue

    const all = await prisma.staffRosterRecord.findMany({ where: {}, select: { id: true, staffId: true } })
    const rosterIdsToDelete = all.filter((r) => normalizeStaffIdKey(r.staffId) === mergeKey).map((r) => r.id)
    if (rosterIdsToDelete.length > 0) {
      const { count } = await prisma.staffRosterRecord.deleteMany({ where: { id: { in: rosterIdsToDelete } } })
      deletedRosterRows += count
    }

    // Written as 4 explicit blocks rather than looping over the model delegates — Prisma's
    // per-model findMany/updateMany argument types don't unify cleanly under one generic loop.
    const variantsIn = (rows: { staffId: string }[]) => rows.map((r) => r.staffId).filter((id) => normalizeStaffIdKey(id) === mergeKey)

    const trainingVariants = variantsIn(await prisma.trainingRecord.findMany({ distinct: ['staffId'], select: { staffId: true } }))
    if (trainingVariants.length > 0) {
      const { count } = await prisma.trainingRecord.updateMany({ where: { staffId: { in: trainingVariants } }, data: { staffId: keepStaffId.toUpperCase() } })
      repointedRecords += count
    }
    const subscriptionVariants = variantsIn(await prisma.subscriptionRecord.findMany({ distinct: ['staffId'], select: { staffId: true } }))
    if (subscriptionVariants.length > 0) {
      const { count } = await prisma.subscriptionRecord.updateMany({ where: { staffId: { in: subscriptionVariants } }, data: { staffId: keepStaffId.toUpperCase() } })
      repointedRecords += count
    }
    const kssVariants = variantsIn(await prisma.kSSRecord.findMany({ distinct: ['staffId'], select: { staffId: true } }))
    if (kssVariants.length > 0) {
      const { count } = await prisma.kSSRecord.updateMany({ where: { staffId: { in: kssVariants } }, data: { staffId: keepStaffId.toUpperCase() } })
      repointedRecords += count
    }
    const managerReviewVariants = variantsIn(await prisma.managerReviewRecord.findMany({ distinct: ['staffId'], select: { staffId: true } }))
    if (managerReviewVariants.length > 0) {
      const { count } = await prisma.managerReviewRecord.updateMany({ where: { staffId: { in: managerReviewVariants } }, data: { staffId: keepStaffId.toUpperCase() } })
      repointedRecords += count
    }
  }

  return { keepStaffId, deletedRosterRows, repointedRecords }
}
