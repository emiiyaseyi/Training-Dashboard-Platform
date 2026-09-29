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

// Same treatment as import-legacy-manager-reviews, for Post-1 Feedback — but FeedbackRecord has no
// staff identifier for most historical rows (the Feedback Excel template never captured one until
// a Staff ID/Staff Email column was added), so this only imports rows that DO have a staffId set:
// every native submission already has one, and an uploaded row has one only if its own sheet
// included that column. Rows without a staffId are reported as skipped, not silently dropped —
// they need either a Staff ID added to their source sheet and a re-upload, or the FeedbackRecord
// row edited directly to add one, before they can be imported.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const [candidates, noStaffIdCount, directory, post1Questions] = await Promise.all([
    prisma.feedbackRecord.findMany({ where: { sourceResponseId: null, staffId: { not: null } } }),
    prisma.feedbackRecord.count({ where: { sourceResponseId: null, staffId: null } }),
    loadRosterDirectory(),
    getStageQuestions('post1'),
  ])

  if (candidates.length === 0) {
    return NextResponse.json({ totalCandidates: 0, imported: 0, unresolved: 0, duplicatesSkipped: 0, noStaffId: noStaffIdCount, schedulesCreated: 0 })
  }

  const fieldQ = (key: string) => post1Questions.find((q) => q.fieldKey === key)
  const qApp = fieldQ('applicationResponse')
  const qImpact = fieldQ('impactAlignment')
  const qConfidence = fieldQ('confidenceRating')
  const qRoleRel = fieldQ('roleRelevance')
  const qExpMet = fieldQ('expectationsMet')
  const qVendorRating = fieldQ('vendorRating')
  const qVendorName = fieldQ('vendorName')
  const qQualitative = fieldQ('qualitativeResponse')

  const byTraining = new Map<string, typeof candidates>()
  for (const r of candidates) {
    const key = r.trainingTitle.trim() || 'Untitled Training'
    const list = byTraining.get(key) || []
    list.push(r)
    byTraining.set(key, list)
  }

  let imported = 0
  let unresolved = 0
  let schedulesCreated = 0
  let duplicatesSkipped = 0

  for (const [trainingName, records] of byTraining) {
    const resolvedAll = records
      .map((r) => ({ record: r, staff: resolveStaff(r.staffId!, directory) }))
      .filter((x) => {
        if (!x.staff) unresolved++
        return !!x.staff
      })

    // Same de-duplication as import-legacy-manager-reviews: the uploaded source data can already
    // contain duplicate rows for the same person + training — keep only the most recently created
    // one per (staffId, training), leave the rest un-imported rather than deleted.
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

    // Batched the same way as import-legacy-manager-reviews: 2 createMany calls plus one
    // transaction of updates per training group, instead of 3 sequential round trips per record.
    const plan = resolvedRecords.map(({ record, staff }) => ({
      attendeeId: randomUUID(),
      responseId: randomUUID(),
      record,
      staff: staff!,
    }))

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
      data: plan.map((p) => {
        const record = p.record
        const answers: Record<string, string> = {}
        if (qApp && record.applicationResponse) answers[qApp.id] = record.applicationResponse
        if (qImpact && record.impactAlignment) answers[qImpact.id] = record.impactAlignment
        if (qConfidence && record.confidenceRating != null) answers[qConfidence.id] = String(record.confidenceRating)
        if (qRoleRel && record.roleRelevance != null) answers[qRoleRel.id] = String(record.roleRelevance)
        if (qExpMet && record.expectationsMet != null) answers[qExpMet.id] = String(record.expectationsMet)
        if (qVendorRating && record.vendorRating != null) answers[qVendorRating.id] = String(record.vendorRating)
        if (qVendorName && record.vendorName) answers[qVendorName.id] = record.vendorName
        if (qQualitative && record.qualitativeResponse) answers[qQualitative.id] = record.qualitativeResponse
        return { id: p.responseId, attendeeId: p.attendeeId, stage: 'post1', answers: JSON.stringify(answers), submittedAt: record.createdAt }
      }),
    })

    await prisma.$transaction(
      plan.map((p) =>
        prisma.feedbackRecord.update({
          where: { id: p.record.id },
          data: { sourceResponseId: p.responseId, businessUnit: p.staff.businessUnit, staffId: p.record.staffId!.toUpperCase() },
        })
      )
    )

    imported += plan.length
  }

  return NextResponse.json({ totalCandidates: candidates.length, imported, unresolved, duplicatesSkipped, noStaffId: noStaffIdCount, schedulesCreated })
}
