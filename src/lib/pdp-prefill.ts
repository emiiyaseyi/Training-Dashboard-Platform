import { prisma } from './prisma'
import { normalizeStaffIdKey } from './staff-id'
import { latestRosterSnapshot } from './staff-training-eligibility'
import type { StaffRosterRecord } from '@prisma/client'

// "Does staff X have a completed training tagged with capability Y" does not exist as a callable
// function anywhere else — src/lib/skills-gap.ts and src/lib/analytics.ts both build the same
// trainedKeysByCapability map internally but only ever reduce it to group-level counts. Same
// case-insensitive matching convention as those two files (a TrainingRecord's capability string
// routinely differs in case from the admin-configured canonical DifferentiatingCapability name).
//
// There is no role -> required-capabilities matrix anywhere in this schema (confirmed, see
// src/lib/skills-gap.ts's own top-of-file comment and the Skills Gap page banner) — so "gap" here
// means the same proxy the Skills Gap page already uses: no completed training tagged with this
// capability at all, applied the same way regardless of role. Reads whatever capabilities are
// currently configured in Admin -> Taxonomies -> Differentiating Capabilities — never a hardcoded
// list or count.
//
// Staff IDs are stored as-entered (not normalized), so matching by exact string or a DB-level
// case-insensitive filter both miss punctuation variants ("MSL-0091" vs "MSL0091") — the
// established convention everywhere else in this codebase (skills-gap.ts, staff-quality.ts) is to
// fetch the relevant tables once and match via normalizeStaffIdKey() in memory. Built the same way
// here as a reusable index, rather than one Prisma query per person — this gets called once per
// staff member when launching a PDP cycle to hundreds of people at once, and a per-person table
// scan at that volume would be far too slow.

export interface PDPCapabilityPrefill {
  name: string
  covered: boolean
}

export interface PDPTrainingHistoryItem {
  trainingName: string
  capability: string | null
  month: string
}

export interface PDPPrefillSnapshot {
  businessUnit: string
  department: string | null
  role: string | null
  capabilities: PDPCapabilityPrefill[]
  // Untagged prior free-text feedback (Post-1/Post-2/manager-review comments) for this person —
  // informational context only, not matched against a specific capability.
  recentFeedback: string[]
  // Every 2026 Learning Intervention (TrainingRecord) this person attended — shown as reference
  // context on page 1 of both tracks' forms, and cross-referenced against Section 3/4 so a
  // respondent can see what's already been addressed before picking new capabilities/needs.
  trainingHistory2026: PDPTrainingHistoryItem[]
}

export interface PDPPrefillIndex {
  capabilityNames: string[]
  rosterByStaffId: Map<string, StaffRosterRecord>
  trainedCapabilitiesByStaffId: Map<string, Set<string>> // normalized staffId -> lowercased capability names
  feedbackByStaffId: Map<string, string[]>
  trainingHistory2026ByStaffId: Map<string, PDPTrainingHistoryItem[]>
}

const MAX_FEEDBACK_HINTS = 3
const TRAINING_HISTORY_YEAR = 2026

export async function buildPDPPrefillIndex(): Promise<PDPPrefillIndex> {
  const [capabilities, roster, trainingRecords, trainingHistoryRecords, feedbackRecords, managerReviews] = await Promise.all([
    prisma.differentiatingCapability.findMany({ orderBy: { order: 'asc' } }),
    prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.trainingRecord.findMany({ select: { staffId: true, capability: true } }),
    prisma.trainingRecord.findMany({ where: { year: TRAINING_HISTORY_YEAR }, select: { staffId: true, training: true, capability: true, month: true } }),
    prisma.feedbackRecord.findMany({ select: { staffId: true, qualitativeResponse: true, applicationResponse: true, impactAlignment: true } }),
    prisma.managerReviewRecord.findMany({ select: { staffId: true, comments: true } }),
  ])

  const rosterByStaffId = new Map<string, StaffRosterRecord>()
  for (const r of latestRosterSnapshot(roster)) rosterByStaffId.set(normalizeStaffIdKey(r.staffId), r)

  const trainedCapabilitiesByStaffId = new Map<string, Set<string>>()
  for (const r of trainingRecords) {
    if (!r.capability) continue
    const key = normalizeStaffIdKey(r.staffId)
    if (!trainedCapabilitiesByStaffId.has(key)) trainedCapabilitiesByStaffId.set(key, new Set())
    trainedCapabilitiesByStaffId.get(key)!.add(r.capability.toLowerCase())
  }

  const trainingHistory2026ByStaffId = new Map<string, PDPTrainingHistoryItem[]>()
  for (const r of trainingHistoryRecords) {
    const key = normalizeStaffIdKey(r.staffId)
    const arr = trainingHistory2026ByStaffId.get(key) ?? []
    arr.push({ trainingName: r.training || 'Unnamed training', capability: r.capability, month: r.month })
    trainingHistory2026ByStaffId.set(key, arr)
  }

  const feedbackByStaffId = new Map<string, string[]>()
  const pushFeedback = (staffId: string, text: string | null) => {
    if (!text?.trim()) return
    const key = normalizeStaffIdKey(staffId)
    const arr = feedbackByStaffId.get(key) ?? []
    if (arr.length < MAX_FEEDBACK_HINTS) arr.push(text.trim())
    feedbackByStaffId.set(key, arr)
  }
  for (const f of feedbackRecords) {
    if (!f.staffId) continue
    pushFeedback(f.staffId, f.qualitativeResponse)
    pushFeedback(f.staffId, f.applicationResponse)
    pushFeedback(f.staffId, f.impactAlignment)
  }
  for (const m of managerReviews) pushFeedback(m.staffId, m.comments)

  return { capabilityNames: capabilities.map((c) => c.name), rosterByStaffId, trainedCapabilitiesByStaffId, feedbackByStaffId, trainingHistory2026ByStaffId }
}

export function getPDPPrefillForStaff(index: PDPPrefillIndex, staffId: string): PDPPrefillSnapshot {
  const key = normalizeStaffIdKey(staffId)
  const roster = index.rosterByStaffId.get(key)
  const trained = index.trainedCapabilitiesByStaffId.get(key) ?? new Set<string>()

  return {
    businessUnit: roster?.businessUnit ?? '',
    department: roster?.department ?? null,
    role: roster?.role ?? null,
    capabilities: index.capabilityNames.map((name) => ({ name, covered: trained.has(name.toLowerCase()) })),
    recentFeedback: index.feedbackByStaffId.get(key) ?? [],
    trainingHistory2026: index.trainingHistory2026ByStaffId.get(key) ?? [],
  }
}
