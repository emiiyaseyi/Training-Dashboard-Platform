import { prisma } from '@/lib/prisma'
import type { TrainingSchedule, TrainingScheduleAttendee } from '@prisma/client'
import { sendMail, hasSmtpCredentials } from '@/lib/mailer'
import { buildSurveyEmail, surveyRecipientRole, type SurveyStage } from '@/lib/survey-email'
import { getAppBaseUrl } from '@/lib/app-url'

const STAGE_SENT_FIELD = {
  pre: 'preSurveySentAt',
  post1: 'post1SurveySentAt',
  post2: 'post2SurveySentAt',
} as const

const STAGE_RESPONDED_FIELD = {
  pre: 'preSurveyRespondedAt',
  post1: 'post1SurveyRespondedAt',
  post2: 'post2SurveyRespondedAt',
} as const

const STAGE_REMINDER_FIELD = {
  pre: 'preReminderAt',
  post1: 'post1ReminderAt',
  post2: 'post2ReminderAt',
} as const

export interface SendSurveyResult {
  sent: number
  skipped: { staffName: string; reason: string }[]
}

// Sends a given survey stage to some/all attendees of a schedule. Pre and Post-1 go to the
// employee (cc: line manager + super admins) since they're self-reported. Post-2 goes to the
// line manager instead (cc: employee + super admins), since that's the manager-authored
// Post-Training Impact Score review, not a self-report. Marks each successfully-sent attendee's
// stage timestamp so re-sending only targets who's left.
//
// onlyUnsent restricts to attendees who don't already have this stage's timestamp set — off by
// default so a manual "send to all" click can deliberately resend as a reminder, but the
// automated cron trigger always passes true so it never re-spams someone once they're sent.
export async function sendSurveyStage(
  scheduleId: string,
  stage: SurveyStage,
  attendeeIds?: string[],
  onlyUnsent = false
): Promise<SendSurveyResult> {
  if (!(await hasSmtpCredentials())) {
    throw new Error('SMTP is not configured yet. Set it up in Admin Settings first.')
  }

  const [schedule, superAdmins] = await Promise.all([
    prisma.trainingSchedule.findUnique({
      where: { id: scheduleId },
      include: { attendees: attendeeIds ? { where: { id: { in: attendeeIds } } } : true },
    }),
    prisma.user.findMany({ where: { isSuperAdmin: true, isActive: true }, select: { email: true } }),
  ])

  if (!schedule) throw new Error('Training schedule not found.')

  const baseUrl = getAppBaseUrl()
  const superAdminEmails = superAdmins.map((u) => u.email).filter((e): e is string => !!e)
  const sentField = STAGE_SENT_FIELD[stage]
  const recipientRole = surveyRecipientRole(stage)
  const result: SendSurveyResult = { sent: 0, skipped: [] }

  const targets = onlyUnsent ? schedule.attendees.filter((a) => !a[sentField]) : schedule.attendees

  for (const attendee of targets) {
    const toAddress = recipientRole === 'manager' ? attendee.lineManagerEmail : attendee.email
    const recipientName = recipientRole === 'manager' ? attendee.lineManagerName : attendee.staffName
    const ccAddress = recipientRole === 'manager' ? attendee.email : attendee.lineManagerEmail

    if (!toAddress) {
      result.skipped.push({
        staffName: attendee.staffName,
        reason: recipientRole === 'manager'
          ? 'No line manager email on file — cannot send the manager review.'
          : 'No email address on file for this staff member.',
      })
      continue
    }

    const cc = [...(ccAddress ? [ccAddress] : []), ...superAdminEmails]
    const { subject, html } = buildSurveyEmail({
      stage,
      recipientName: recipientName || 'there',
      employeeName: attendee.staffName,
      trainingName: schedule.trainingName,
      formUrl: `${baseUrl}/survey/${attendee.surveyToken}/${stage}`,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      trainingType: schedule.trainingType,
    })
    try {
      await sendMail({ to: toAddress, cc, subject, html })
      // Also stamps the reminder baseline (STAGE_REMINDER_FIELD) to now, so the reminder sweep's
      // "hours since last nudge" interval starts counting from this send, not from epoch/null.
      await prisma.trainingScheduleAttendee.update({
        where: { id: attendee.id },
        data: { [sentField]: new Date(), [STAGE_REMINDER_FIELD[stage]]: new Date() },
      })
      result.sent++
    } catch (err) {
      result.skipped.push({ staffName: attendee.staffName, reason: err instanceof Error ? err.message : 'Send failed.' })
    }
  }

  return result
}

const HOUR_MS = 3600000
const DAY_MS = 86400000

// Nudges attendees who have been sent a stage but haven't responded yet — runs from the daily
// cron, per schedule per stage, reusing the already-fetched schedule+attendees rather than
// re-querying. Skips anyone whose survey has expired (per SurveySettings.expiryDays), since a
// reminder pointing at a form that will refuse the submission is worse than no reminder.
export async function sendSurveyReminders(
  schedule: TrainingSchedule & { attendees: TrainingScheduleAttendee[] },
  stage: SurveyStage,
  settings: { reminderIntervalHours: number; expiryEnabled: boolean; expiryDays: number }
): Promise<SendSurveyResult> {
  const result: SendSurveyResult = { sent: 0, skipped: [] }
  if (!(await hasSmtpCredentials())) return result

  const sentField = STAGE_SENT_FIELD[stage]
  const respondedField = STAGE_RESPONDED_FIELD[stage]
  const reminderField = STAGE_REMINDER_FIELD[stage]
  const now = Date.now()

  const due = schedule.attendees.filter((a) => {
    const sentAt = a[sentField]
    if (!sentAt || a[respondedField]) return false
    if (settings.expiryEnabled && now - sentAt.getTime() >= settings.expiryDays * DAY_MS) return false
    const lastNudge = (a[reminderField] || sentAt).getTime()
    return now - lastNudge >= settings.reminderIntervalHours * HOUR_MS
  })
  if (due.length === 0) return result

  const baseUrl = getAppBaseUrl()
  const recipientRole = surveyRecipientRole(stage)
  const superAdmins = await prisma.user.findMany({ where: { isSuperAdmin: true, isActive: true }, select: { email: true } })
  const superAdminEmails = superAdmins.map((u) => u.email).filter((e): e is string => !!e)

  for (const attendee of due) {
    const toAddress = recipientRole === 'manager' ? attendee.lineManagerEmail : attendee.email
    const recipientName = recipientRole === 'manager' ? attendee.lineManagerName : attendee.staffName
    const ccAddress = recipientRole === 'manager' ? attendee.email : attendee.lineManagerEmail
    if (!toAddress) continue // already reported as skipped by the original send

    const cc = [...(ccAddress ? [ccAddress] : []), ...superAdminEmails]
    const { subject, html } = buildSurveyEmail({
      stage,
      recipientName: recipientName || 'there',
      employeeName: attendee.staffName,
      trainingName: schedule.trainingName,
      formUrl: `${baseUrl}/survey/${attendee.surveyToken}/${stage}`,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      trainingType: schedule.trainingType,
      isReminder: true,
    })
    try {
      await sendMail({ to: toAddress, cc, subject, html })
      await prisma.trainingScheduleAttendee.update({ where: { id: attendee.id }, data: { [reminderField]: new Date() } })
      result.sent++
    } catch (err) {
      result.skipped.push({ staffName: attendee.staffName, reason: err instanceof Error ? err.message : 'Reminder send failed.' })
    }
  }

  return result
}
