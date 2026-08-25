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
//
// Duplicate-send guard: when attendeeIds is omitted (a bulk "send to all" click, not a specific
// person), anyone who has ALREADY RESPONDED to this stage is always excluded regardless of
// onlyUnsent — bulk actions should never re-prompt someone who already filled the form. An
// explicit attendeeIds list (the per-attendee resend button) bypasses this on purpose, since
// clicking one person's tick is a deliberate, individually-confirmed override.
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
  if (stage === 'pre' && schedule.sourcedFromHistoricalData) {
    throw new Error('Pre-Training surveys can\'t be sent for a training added via Already Attended Trainings — it already happened.')
  }
  if (stage === 'pre' && !schedule.preEnabled) {
    throw new Error('Pre-Training is turned off for this schedule.')
  }
  if (stage === 'post1' && !schedule.post1Enabled) {
    throw new Error('Post-1 is turned off for this schedule.')
  }
  if (stage === 'post2' && !schedule.post2Enabled) {
    throw new Error('Post-2 is turned off for this schedule.')
  }

  const baseUrl = getAppBaseUrl()
  const superAdminEmails = superAdmins.map((u) => u.email).filter((e): e is string => !!e)
  const sentField = STAGE_SENT_FIELD[stage]
  const respondedField = STAGE_RESPONDED_FIELD[stage]
  const recipientRole = surveyRecipientRole(stage)
  const result: SendSurveyResult = { sent: 0, skipped: [] }

  const targets = attendeeIds
    ? schedule.attendees
    : schedule.attendees.filter((a) => (onlyUnsent ? !a[sentField] : !a[respondedField]))

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
      isHistorical: schedule.sourcedFromHistoricalData,
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
      await logSend(schedule, stage, attendee, toAddress, false, true, null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Send failed.'
      result.skipped.push({ staffName: attendee.staffName, reason: message })
      await logSend(schedule, stage, attendee, toAddress, false, false, message)
    }
  }

  return result
}

async function logSend(
  schedule: { id: string; trainingName: string },
  stage: SurveyStage,
  attendee: TrainingScheduleAttendee,
  recipient: string,
  isReminder: boolean,
  success: boolean,
  errorMessage: string | null
): Promise<void> {
  try {
    await prisma.surveySendLog.create({
      data: {
        scheduleId: schedule.id,
        trainingName: schedule.trainingName,
        stage,
        attendeeId: attendee.id,
        staffName: attendee.staffName,
        recipient,
        isReminder,
        success,
        errorMessage,
      },
    })
  } catch (err) {
    console.error('[survey-send] failed to write send log', err)
  }
}

const DAY_MS = 86400000

// Nudges attendees who have been sent a stage but haven't responded yet — runs from the daily
// cron, per schedule per stage, reusing the already-fetched schedule+attendees rather than
// re-querying. Skips anyone whose survey has expired (per SurveySettings.expiryDays), since a
// reminder pointing at a form that will refuse the submission is worse than no reminder.
//
// Cadence is once per UTC calendar day, not a rolling N-hour window: the cron itself only runs
// once a day (vercel.json, fixed UTC time), so a "24 hours since last nudge" check could miss an
// entire day depending on what time the original send happened relative to the cron's fixed
// time. Comparing calendar dates instead means anyone still unresponded gets reminded on every
// day's run, full stop, until they respond or expire — matching the actual daily cadence.
export async function sendSurveyReminders(
  schedule: TrainingSchedule & { attendees: TrainingScheduleAttendee[] },
  stage: SurveyStage,
  settings: { expiryEnabled: boolean; expiryDays: number }
): Promise<SendSurveyResult> {
  const result: SendSurveyResult = { sent: 0, skipped: [] }
  if (!(await hasSmtpCredentials())) return result
  if (!schedule.remindersEnabled) return result
  if (stage === 'pre' && !schedule.preEnabled) return result
  if (stage === 'post1' && !schedule.post1Enabled) return result
  if (stage === 'post2' && !schedule.post2Enabled) return result

  const sentField = STAGE_SENT_FIELD[stage]
  const respondedField = STAGE_RESPONDED_FIELD[stage]
  const reminderField = STAGE_REMINDER_FIELD[stage]
  const now = Date.now()
  const todayKey = new Date(now).toISOString().slice(0, 10)

  const due = schedule.attendees.filter((a) => {
    const sentAt = a[sentField]
    if (!sentAt || a[respondedField]) return false
    if (settings.expiryEnabled && now - sentAt.getTime() >= settings.expiryDays * DAY_MS) return false
    const lastNudge = a[reminderField] || sentAt
    return lastNudge.toISOString().slice(0, 10) !== todayKey
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
      isHistorical: schedule.sourcedFromHistoricalData,
    })
    try {
      await sendMail({ to: toAddress, cc, subject, html })
      await prisma.trainingScheduleAttendee.update({ where: { id: attendee.id }, data: { [reminderField]: new Date() } })
      result.sent++
      await logSend(schedule, stage, attendee, toAddress, true, true, null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reminder send failed.'
      result.skipped.push({ staffName: attendee.staffName, reason: message })
      await logSend(schedule, stage, attendee, toAddress, true, false, message)
    }
  }

  return result
}
