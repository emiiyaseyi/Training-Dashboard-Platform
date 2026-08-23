import { prisma } from '@/lib/prisma'

export interface TableAuditSample {
  id: string
  summary: string
  issues: string[]
  // Current values of the fields this table's checks can flag, keyed by field name — lets the
  // admin fix a flagged record in place instead of just seeing that it's broken. Omitted (left
  // undefined) for tables with no in-place fix UI yet.
  fields?: Record<string, string>
}

export interface TableAudit {
  table: string
  label: string
  totalRecords: number
  issueCount: number
  samples: TableAuditSample[]
}

// A Staff ID that fell back to the upload-time "UNKNOWN_N" placeholder isn't a real identifier —
// it's assigned per row, not per person, so two different people can share one. Used both to
// decide whether a Staff ID is trustworthy enough to match OTHER records by (see
// hasMatchingIssue below), and by the audit functions above to flag it as missing in the first place.
export function isBlankStaffId(id: string): boolean {
  return !id || id.startsWith('UNKNOWN_')
}

// Shared by every "click to fix, optionally propagate" fix function in
// src/app/api/admin/data-quality/[table]/[id]/route.ts: given a candidate record and the list of
// field names just fixed on another record, does this candidate show the SAME issue for any of
// those fields (so it's a legitimate propagation target), or does it already have a real value
// (so propagating would overwrite something legitimately different)?
export function hasMatchingIssue(candidate: Record<string, unknown>, fixedFields: string[]): boolean {
  return fixedFields.some((field) => {
    if (field === 'staffId') return isBlankStaffId(String(candidate.staffId ?? ''))
    return !candidate[field]
  })
}

// Flags the specific, common failure patterns this app is known to produce when a source file
// is missing a column or has blank cells: a staffId that fell back to "UNKNOWN_N", a blank
// Business Unit, a zero/blank amount, etc. One row can have several flags at once.
// `samples` returns up to 200 flagged rows per table (searchable/paginated client-side) — beyond
// that, issueCount still reports the true total so the UI can show "+N more not shown".
export async function runDataQualityAudit(): Promise<TableAudit[]> {
  const [training, feedback, subscription, kss, roster, managerReview] = await Promise.all([
    auditTraining(),
    auditFeedback(),
    auditSubscription(),
    auditKSS(),
    auditRoster(),
    auditManagerReview(),
  ])
  return [training, feedback, subscription, kss, roster, managerReview]
}

async function auditTraining(): Promise<TableAudit> {
  // Cost has no "not entered" state distinct from a deliberate 0 — it's a required numeric
  // column, so a genuinely blank cell and an admin intentionally recording a free/zero-cost
  // training both end up stored as the same 0. Flagging every 0 as an "issue" meant every
  // legitimately free training got reported as broken data, so this no longer checks cost at all.
  const where = { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { training: '' }] }
  const [total, problems] = await Promise.all([
    prisma.trainingRecord.count(),
    prisma.trainingRecord.findMany({ where, take: 200, orderBy: { createdAt: 'desc' } }),
  ])
  const issueCount = await prisma.trainingRecord.count({ where })
  return {
    table: 'training',
    label: 'Training Cost',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      id: r.id,
      summary: `${r.staffName || '(no name)'} — ${r.training || '(no training name)'}`,
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
        !r.training && 'Training name missing',
      ].filter((x): x is string => !!x),
      fields: { staffId: r.staffId.startsWith('UNKNOWN_') ? '' : r.staffId, businessUnit: r.businessUnit, training: r.training },
    })),
  }
}

async function auditFeedback(): Promise<TableAudit> {
  const where = { OR: [{ businessUnit: '' }, { trainingTitle: '' }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.feedbackRecord.count(),
    prisma.feedbackRecord.count({ where }),
    prisma.feedbackRecord.findMany({ where, take: 200, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'feedback',
    label: 'Training Feedback',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      id: r.id,
      summary: r.trainingTitle || '(no training title)',
      issues: [!r.businessUnit && 'Business Unit missing', !r.trainingTitle && 'Training Title missing'].filter((x): x is string => !!x),
      fields: { businessUnit: r.businessUnit, trainingTitle: r.trainingTitle },
    })),
  }
}

async function auditSubscription(): Promise<TableAudit> {
  // Amount, like Training Cost, has no way to distinguish a deliberate 0 from a blank cell — see
  // the comment in auditTraining.
  const where = { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { membershipOrg: '' }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.subscriptionRecord.count(),
    prisma.subscriptionRecord.count({ where }),
    prisma.subscriptionRecord.findMany({ where, take: 200, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'subscription',
    label: 'Subscriptions',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      id: r.id,
      summary: `${r.staffName || '(no name)'} — ${r.membershipOrg || '(no organization)'}`,
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
        !r.membershipOrg && 'Membership Organization missing',
      ].filter((x): x is string => !!x),
      fields: { staffId: r.staffId.startsWith('UNKNOWN_') ? '' : r.staffId, businessUnit: r.businessUnit, membershipOrg: r.membershipOrg },
    })),
  }
}

async function auditKSS(): Promise<TableAudit> {
  // Duration, like Training Cost, has no way to distinguish a deliberate 0 from a blank cell —
  // see the comment in auditTraining.
  const where = { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.kSSRecord.count(),
    prisma.kSSRecord.count({ where }),
    prisma.kSSRecord.findMany({ where, take: 200, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'kss',
    label: 'KSS',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      id: r.id,
      summary: r.staffName || '(no name)',
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
      ].filter((x): x is string => !!x),
      fields: { staffId: r.staffId.startsWith('UNKNOWN_') ? '' : r.staffId, businessUnit: r.businessUnit },
    })),
  }
}

async function auditRoster(): Promise<TableAudit> {
  const where = { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { email: null }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.staffRosterRecord.count(),
    prisma.staffRosterRecord.count({ where }),
    prisma.staffRosterRecord.findMany({ where, take: 200, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'roster',
    label: 'Staff Roster',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      id: r.id,
      summary: [r.firstName, r.lastName].filter(Boolean).join(' ') || '(no name)',
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
        !r.email && 'Email missing (blocks Survey Automation for this person)',
      ].filter((x): x is string => !!x),
      // No `fields` here — fixed via the dedicated Staff Data Quality panel above, which already
      // has full click-to-edit (including Line Manager lookup) for this same table.
    })),
  }
}

async function auditManagerReview(): Promise<TableAudit> {
  // Impact Score, like Training Cost, has no way to distinguish a deliberate 0 from a blank
  // cell — see the comment in auditTraining. No longer flagged for the same reason.
  const where = { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.managerReviewRecord.count(),
    prisma.managerReviewRecord.count({ where }),
    prisma.managerReviewRecord.findMany({ where, take: 200, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'manager-review',
    label: 'Post-Training Manager Reviews',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      id: r.id,
      summary: `${r.staffName || '(no name)'} — ${r.training || '(no training)'}`,
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
      ].filter((x): x is string => !!x),
      fields: { staffId: r.staffId.startsWith('UNKNOWN_') ? '' : r.staffId, businessUnit: r.businessUnit },
    })),
  }
}
