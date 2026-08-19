import { prisma } from '@/lib/prisma'

export interface TableAudit {
  table: string
  label: string
  totalRecords: number
  issueCount: number
  samples: { summary: string; issues: string[] }[]
}

// Flags the specific, common failure patterns this app is known to produce when a source file
// is missing a column or has blank cells: a staffId that fell back to "UNKNOWN_N", a blank
// Business Unit, a zero/blank amount, etc. One row can have several flags at once.
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
  const [total, problems] = await Promise.all([
    prisma.trainingRecord.count(),
    prisma.trainingRecord.findMany({
      where: { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { training: '' }, { cost: { lte: 0 } }] },
      take: 3,
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const issueCount = await prisma.trainingRecord.count({
    where: { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { training: '' }, { cost: { lte: 0 } }] },
  })
  return {
    table: 'training',
    label: 'Training Cost',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      summary: `${r.staffName || '(no name)'} — ${r.training || '(no training name)'}`,
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
        !r.training && 'Training name missing',
        r.cost <= 0 && 'Cost is zero or missing',
      ].filter((x): x is string => !!x),
    })),
  }
}

async function auditFeedback(): Promise<TableAudit> {
  const where = { OR: [{ businessUnit: '' }, { trainingTitle: '' }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.feedbackRecord.count(),
    prisma.feedbackRecord.count({ where }),
    prisma.feedbackRecord.findMany({ where, take: 3, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'feedback',
    label: 'Training Feedback',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      summary: r.trainingTitle || '(no training title)',
      issues: [!r.businessUnit && 'Business Unit missing', !r.trainingTitle && 'Training Title missing'].filter((x): x is string => !!x),
    })),
  }
}

async function auditSubscription(): Promise<TableAudit> {
  const where = { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { membershipOrg: '' }, { amount: { lte: 0 } }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.subscriptionRecord.count(),
    prisma.subscriptionRecord.count({ where }),
    prisma.subscriptionRecord.findMany({ where, take: 3, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'subscription',
    label: 'Subscriptions',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      summary: `${r.staffName || '(no name)'} — ${r.membershipOrg || '(no organization)'}`,
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
        !r.membershipOrg && 'Membership Organization missing',
        r.amount <= 0 && 'Amount is zero or missing',
      ].filter((x): x is string => !!x),
    })),
  }
}

async function auditKSS(): Promise<TableAudit> {
  const where = { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { durationMinutes: { lte: 0 } }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.kSSRecord.count(),
    prisma.kSSRecord.count({ where }),
    prisma.kSSRecord.findMany({ where, take: 3, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'kss',
    label: 'KSS',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      summary: r.staffName || '(no name)',
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
        r.durationMinutes <= 0 && 'Duration is zero or missing',
      ].filter((x): x is string => !!x),
    })),
  }
}

async function auditRoster(): Promise<TableAudit> {
  const where = { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { email: null }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.staffRosterRecord.count(),
    prisma.staffRosterRecord.count({ where }),
    prisma.staffRosterRecord.findMany({ where, take: 3, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'roster',
    label: 'Staff Roster',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      summary: [r.firstName, r.lastName].filter(Boolean).join(' ') || '(no name)',
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
        !r.email && 'Email missing (blocks Survey Automation for this person)',
      ].filter((x): x is string => !!x),
    })),
  }
}

async function auditManagerReview(): Promise<TableAudit> {
  const where = { OR: [{ staffId: { startsWith: 'UNKNOWN_' } }, { businessUnit: '' }, { impactScore: { lte: 0 } }] }
  const [total, issueCount, problems] = await Promise.all([
    prisma.managerReviewRecord.count(),
    prisma.managerReviewRecord.count({ where }),
    prisma.managerReviewRecord.findMany({ where, take: 3, orderBy: { createdAt: 'desc' } }),
  ])
  return {
    table: 'manager-review',
    label: 'Post-Training Manager Reviews',
    totalRecords: total,
    issueCount,
    samples: problems.map((r) => ({
      summary: `${r.staffName || '(no name)'} — ${r.training || '(no training)'}`,
      issues: [
        r.staffId.startsWith('UNKNOWN_') && 'Staff ID missing (no match on upload)',
        !r.businessUnit && 'Business Unit missing',
        r.impactScore <= 0 && 'Impact Score is zero or missing',
      ].filter((x): x is string => !!x),
    })),
  }
}
