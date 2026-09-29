import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaff } from '@/lib/staff-directory'
import { getStageQuestions } from '@/lib/survey-questions'

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
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const [orphans, directory, post2Questions] = await Promise.all([
    prisma.managerReviewRecord.findMany({ where: { sourceResponseId: null } }),
    loadRosterDirectory(),
    getStageQuestions('post2'),
  ])

  if (orphans.length === 0) {
    return NextResponse.json({ totalFound: 0, imported: 0, unresolved: 0, schedulesCreated: 0 })
  }

  const impactQ = post2Questions.find((q) => q.fieldKey === 'impactScore')
  const commentsQ = post2Questions.find((q) => q.fieldKey === 'comments')

  // Group by training name so every legacy review for the same programme lands under one shared
  // schedule, rather than one schedule per row.
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

  for (const [trainingName, records] of byTraining) {
    const resolvedRecords = records
      .map((r) => ({ record: r, staff: resolveStaff(r.staffId, directory) }))
      .filter((x) => {
        if (!x.staff) unresolved++
        return !!x.staff
      })
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

    for (const { record, staff } of resolvedRecords) {
      const attendee = await prisma.trainingScheduleAttendee.create({
        data: {
          scheduleId: schedule.id,
          staffId: record.staffId,
          staffName: staff!.name,
          email: staff!.email,
          lineManagerName: null,
          post2SurveySentAt: record.createdAt,
          post2SurveyRespondedAt: record.createdAt,
        },
      })

      const answers: Record<string, string> = {}
      if (impactQ) answers[impactQ.id] = String(record.impactScore)
      if (commentsQ && record.comments) answers[commentsQ.id] = record.comments

      const response = await prisma.surveyResponse.create({
        data: { attendeeId: attendee.id, stage: 'post2', answers: JSON.stringify(answers), submittedAt: record.createdAt },
      })

      await prisma.managerReviewRecord.update({
        where: { id: record.id },
        data: { sourceResponseId: response.id, businessUnit: staff!.businessUnit, staffName: staff!.name },
      })
      imported++
    }
  }

  return NextResponse.json({ totalFound: orphans.length, imported, unresolved, schedulesCreated })
}
