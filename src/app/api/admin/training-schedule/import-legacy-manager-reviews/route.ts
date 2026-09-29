import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'
import { getStageQuestions } from '@/lib/survey-questions'
import { normalizeStaffIdKey } from '@/lib/staff-id'

// Headroom for a large legacy batch — see the batching notes below for why this is now fast enough
// that it rarely matters, but a very large one-off import could still take a while. Either way,
// this is a server-side request: once it starts, Vercel keeps the function running to completion
// regardless of whether the admin navigates away or closes the tab — they just won't see the
// result message for that run. Re-running is always safe, since already-imported records
// (sourceResponseId already set) are skipped.
export const maxDuration = 60

// One-time import of pre-existing ManagerReviewRecord rows that came from the spreadsheet upload
// at /api/upload/manager-review (i.e. entirely outside Survey Automation, with no SurveyResponse
// behind them) — the second data source that was making a Business Unit's "Post-Training Impact"
// disagree with the Survey Insights panel's native-only view. Rather than filtering the dashboard
// down to survey-automation-only data (which would just make these real reviews disappear from
// the numbers), this converts each one INTO a proper survey-automation record: a synthetic
// "Legacy Manager Reviews" TrainingSchedule/attendee/SurveyResponse is created so the review
// becomes individually visible and editable in Survey Insights exactly like a live submission,
// and the ORIGINAL ManagerReviewRecord row is kept (not duplicated) and just linked via
// sourceResponseId — so it's the same row the dashboard already reads, now with provenance.
// Safe to re-run: only rows with sourceResponseId still null are touched.
//
// Per training group, this is 2 createMany calls (attendees, then responses) plus one batched
// transaction for the ManagerReviewRecord updates, instead of the original one-record-at-a-time
// loop (3 sequential awaited round trips per record). createMany can't hand back the rows it just
// inserted, so attendee/response ids are generated client-side (any unique string works — the
// schema's cuid() is only ever a *default* for when no id is supplied) rather than looked up with
// a follow-up query.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const [orphans, directory, post2Questions] = await Promise.all([
    prisma.managerReviewRecord.findMany({ where: { sourceResponseId: null } }),
    loadRosterDirectory(),
    getStageQuestions('post2'),
  ])

  if (orphans.length === 0) {
    return NextResponse.json({ totalFound: 0, imported: 0, unresolved: 0, duplicatesSkipped: 0, schedulesCreated: 0 })
  }

  const impactQ = post2Questions.find((q) => q.fieldKey === 'impactScore')
  const commentsQ = post2Questions.find((q) => q.fieldKey === 'comments')

  const byTraining = new Map<string, typeof orphans>()
  for (const r of orphans) {
    const key = r.training.trim() || 'Untitled Training'
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
      .map((r) => ({ record: r, staff: resolveStaff(r.staffId, directory) }))
      .filter((x) => {
        if (!x.staff) unresolved++
        return !!x.staff
      })

    // The uploaded source data itself can contain duplicate rows for the same person + training
    // (e.g. an accidental double-paste in the spreadsheet) — importing each one as its own
    // response would multiply, not just carry forward, the problem. Keep only the most recently
    // created row per (staffId, training); the rest are left un-imported (sourceResponseId stays
    // null) rather than deleted, since they're still real database rows an admin may want to
    // review before removing.
    const byStaff = new Map<string, typeof resolvedAll>()
    for (const x of resolvedAll) {
      const key = normalizeStaffIdKey(x.record.staffId)
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
      where: { trainingName, sourcedFromHistoricalData: true, post1Enabled: false, preEnabled: false },
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
        post1Enabled: false,
        post2Enabled: true,
      },
    })
    if (!existingLegacySchedule) schedulesCreated++

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
        staffId: p.record.staffId,
        staffName: p.staff.name,
        email: p.staff.email,
        post2SurveySentAt: p.record.createdAt,
        post2SurveyRespondedAt: p.record.createdAt,
      })),
    })

    await prisma.surveyResponse.createMany({
      data: plan.map((p) => {
        const answers: Record<string, string> = {}
        if (impactQ) answers[impactQ.id] = String(p.record.impactScore)
        if (commentsQ && p.record.comments) answers[commentsQ.id] = p.record.comments
        return { id: p.responseId, attendeeId: p.attendeeId, stage: 'post2', answers: JSON.stringify(answers), submittedAt: p.record.createdAt }
      }),
    })

    await prisma.$transaction(
      plan.map((p) =>
        prisma.managerReviewRecord.update({
          where: { id: p.record.id },
          data: { sourceResponseId: p.responseId, businessUnit: p.staff.businessUnit, staffName: p.staff.name },
        })
      )
    )

    imported += plan.length
  }

  return NextResponse.json({ totalFound: orphans.length, imported, unresolved, duplicatesSkipped, schedulesCreated })
}
