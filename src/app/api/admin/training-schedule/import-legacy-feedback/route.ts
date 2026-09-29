import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'
import { getStageQuestions } from '@/lib/survey-questions'
import { normalizeStaffIdKey } from '@/lib/staff-id'

// Headroom for a large legacy batch — see import-legacy-manager-reviews for why, and why leaving
// the page doesn't stop the server-side work already in progress.
export const maxDuration = 60

const fieldAnswers = (
  record: { applicationResponse: string | null; impactAlignment: string | null; confidenceRating: number | null; roleRelevance: number | null; expectationsMet: number | null; vendorRating: number | null; vendorName: string | null; qualitativeResponse: string | null },
  q: { app?: string; impact?: string; confidence?: string; roleRel?: string; expMet?: string; vendorRating?: string; vendorName?: string; qualitative?: string }
) => {
  const answers: Record<string, string> = {}
  if (q.app && record.applicationResponse) answers[q.app] = record.applicationResponse
  if (q.impact && record.impactAlignment) answers[q.impact] = record.impactAlignment
  if (q.confidence && record.confidenceRating != null) answers[q.confidence] = String(record.confidenceRating)
  if (q.roleRel && record.roleRelevance != null) answers[q.roleRel] = String(record.roleRelevance)
  if (q.expMet && record.expectationsMet != null) answers[q.expMet] = String(record.expectationsMet)
  if (q.vendorRating && record.vendorRating != null) answers[q.vendorRating] = String(record.vendorRating)
  if (q.vendorName && record.vendorName) answers[q.vendorName] = record.vendorName
  if (q.qualitative && record.qualitativeResponse) answers[q.qualitative] = record.qualitativeResponse
  return answers
}

// Same treatment as import-legacy-manager-reviews, for Post-1 Feedback, in two tiers:
//   - A row WITH a Staff ID (native, or an uploaded sheet that included one) is imported exactly
//     like a Manager Review: matched to the current roster, grouped under a shared "Legacy
//     Feedback" schedule per training, de-duplicated against other rows for the same person.
//   - A row with NO Staff ID at all — the norm for historical Feedback uploads, which never
//     captured one — is imported anonymously instead of left out forever: a placeholder identity
//     ("Unknown (Legacy Feedback)", same UNKNOWN_-prefixed convention the Excel parsers already
//     use for a row with no Staff ID column) so it still becomes a real, editable Survey
//     Automation entry. Grouped by (training, Business Unit) rather than just training, since
//     there's no attendee to resolve a current Business Unit from — the schedule's own BU has to
//     be right on its own, and anonymous rows for the same training can genuinely span more than
//     one BU. No de-duplication is attempted for these: with no identity, there's no safe way to
//     tell "two different people gave the same rating" apart from "the same row twice".
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const [orphans, directory, post1Questions] = await Promise.all([
    prisma.feedbackRecord.findMany({ where: { sourceResponseId: null } }),
    loadRosterDirectory(),
    getStageQuestions('post1'),
  ])

  if (orphans.length === 0) {
    return NextResponse.json({ totalFound: 0, imported: 0, anonymousImported: 0, unresolved: 0, duplicatesSkipped: 0, schedulesCreated: 0 })
  }

  const q = {
    app: post1Questions.find((x) => x.fieldKey === 'applicationResponse')?.id,
    impact: post1Questions.find((x) => x.fieldKey === 'impactAlignment')?.id,
    confidence: post1Questions.find((x) => x.fieldKey === 'confidenceRating')?.id,
    roleRel: post1Questions.find((x) => x.fieldKey === 'roleRelevance')?.id,
    expMet: post1Questions.find((x) => x.fieldKey === 'expectationsMet')?.id,
    vendorRating: post1Questions.find((x) => x.fieldKey === 'vendorRating')?.id,
    vendorName: post1Questions.find((x) => x.fieldKey === 'vendorName')?.id,
    qualitative: post1Questions.find((x) => x.fieldKey === 'qualitativeResponse')?.id,
  }

  const withStaffId = orphans.filter((r) => r.staffId)
  const anonymous = orphans.filter((r) => !r.staffId)

  let imported = 0
  let unresolved = 0
  let duplicatesSkipped = 0
  let schedulesCreated = 0

  // ── Tier 1: has a Staff ID — resolve against the current roster, same as Manager Reviews ──
  const byTraining = new Map<string, typeof withStaffId>()
  for (const r of withStaffId) {
    const key = r.trainingTitle.trim() || 'Untitled Training'
    const list = byTraining.get(key) || []
    list.push(r)
    byTraining.set(key, list)
  }

  for (const [trainingName, records] of byTraining) {
    const resolvedAll = records
      .map((r) => ({ record: r, staff: resolveStaff(r.staffId!, directory) }))
      .filter((x) => {
        if (!x.staff) unresolved++
        return !!x.staff
      })

    const byStaff = new Map<string, typeof resolvedAll>()
    for (const x of resolvedAll) {
      const key = normalizeStaffIdKey(x.record.staffId!)
      const list = byStaff.get(key) || []
      list.push(x)
      byStaff.set(key, list)
    }
    const resolvedRecords: typeof resolvedAll = []
    for (const group of byStaff.values()) {
      if (group.length === 1) {
        resolvedRecords.push(group[0])
        continue
      }
      const newest = group.reduce((latest, x) => (x.record.createdAt > latest.record.createdAt ? x : latest), group[0])
      resolvedRecords.push(newest)
      duplicatesSkipped += group.length - 1
    }
    if (resolvedRecords.length === 0) continue

    const earliest = records.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), records[0].createdAt)
    const existingLegacySchedule = await prisma.trainingSchedule.findFirst({
      where: { trainingName, sourcedFromHistoricalData: true, preEnabled: false, post2Enabled: false },
    })
    const schedule = existingLegacySchedule ?? await prisma.trainingSchedule.create({
      data: {
        trainingName,
        businessUnit: resolvedRecords[0].staff!.businessUnit,
        startDate: earliest,
        endDate: earliest,
        sourcedFromHistoricalData: true,
        remindersEnabled: false,
        preEnabled: false,
        post1Enabled: true,
        post2Enabled: false,
      },
    })
    if (!existingLegacySchedule) schedulesCreated++

    const plan = resolvedRecords.map(({ record, staff }) => ({ attendeeId: randomUUID(), responseId: randomUUID(), record, staff: staff! }))

    await prisma.trainingScheduleAttendee.createMany({
      data: plan.map((p) => ({
        id: p.attendeeId,
        scheduleId: schedule.id,
        staffId: p.record.staffId!,
        staffName: p.staff.name,
        email: p.staff.email,
        post1SurveySentAt: p.record.createdAt,
        post1SurveyRespondedAt: p.record.createdAt,
      })),
    })
    await prisma.surveyResponse.createMany({
      data: plan.map((p) => ({ id: p.responseId, attendeeId: p.attendeeId, stage: 'post1', answers: JSON.stringify(fieldAnswers(p.record, q)), submittedAt: p.record.createdAt })),
    })
    await prisma.$transaction(
      plan.map((p) => prisma.feedbackRecord.update({
        where: { id: p.record.id },
        data: { sourceResponseId: p.responseId, businessUnit: p.staff.businessUnit, staffId: p.record.staffId!.toUpperCase() },
      }))
    )
    imported += plan.length
  }

  // ── Tier 2: no Staff ID at all — import anonymously, grouped by (training, Business Unit) ──
  const byTrainingAndBU = new Map<string, typeof anonymous>()
  for (const r of anonymous) {
    const key = `${r.trainingTitle.trim() || 'Untitled Training'}|||${r.businessUnit}`
    const list = byTrainingAndBU.get(key) || []
    list.push(r)
    byTrainingAndBU.set(key, list)
  }

  let anonymousImported = 0
  for (const [key, records] of byTrainingAndBU) {
    const [trainingName, businessUnit] = key.split('|||')
    const earliest = records.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), records[0].createdAt)
    const existingLegacySchedule = await prisma.trainingSchedule.findFirst({
      where: { trainingName, businessUnit, sourcedFromHistoricalData: true, preEnabled: false, post2Enabled: false },
    })
    const schedule = existingLegacySchedule ?? await prisma.trainingSchedule.create({
      data: {
        trainingName,
        businessUnit,
        startDate: earliest,
        endDate: earliest,
        sourcedFromHistoricalData: true,
        remindersEnabled: false,
        preEnabled: false,
        post1Enabled: true,
        post2Enabled: false,
      },
    })
    if (!existingLegacySchedule) schedulesCreated++

    const plan = records.map((record) => ({ attendeeId: randomUUID(), responseId: randomUUID(), record }))

    await prisma.trainingScheduleAttendee.createMany({
      data: plan.map((p) => ({
        id: p.attendeeId,
        scheduleId: schedule.id,
        staffId: `UNKNOWN_${p.attendeeId.slice(0, 8)}`,
        staffName: 'Unknown (Legacy Feedback)',
        post1SurveySentAt: p.record.createdAt,
        post1SurveyRespondedAt: p.record.createdAt,
      })),
    })
    await prisma.surveyResponse.createMany({
      data: plan.map((p) => ({ id: p.responseId, attendeeId: p.attendeeId, stage: 'post1', answers: JSON.stringify(fieldAnswers(p.record, q)), submittedAt: p.record.createdAt })),
    })
    await prisma.$transaction(
      plan.map((p) => prisma.feedbackRecord.update({ where: { id: p.record.id }, data: { sourceResponseId: p.responseId } }))
    )
    anonymousImported += plan.length
  }
  imported += anonymousImported

  return NextResponse.json({ totalFound: orphans.length, imported, anonymousImported, unresolved, duplicatesSkipped, schedulesCreated })
}
