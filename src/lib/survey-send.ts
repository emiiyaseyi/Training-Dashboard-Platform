import { prisma } from '@/lib/prisma'
import type { TrainingSchedule, TrainingScheduleAttendee } from '@prisma/client'
import { createMailSender, hasSmtpCredentials, parseCcList } from '@/lib/mailer'
import { buildSurveyEmail, surveyRecipientRole, type SurveyStage } from '@/lib/survey-email'
import { getAppBaseUrl } from '@/lib/app-url'
import { loadRosterDirectory, resolveCurrentManagerFields, type ResolvedStaff } from '@/lib/staff-directory'

// Re-resolves an attendee's Line Manager against the CURRENT roster right before a send, and
// persists it if it changed. attendee.lineManagerName/Email are a snapshot taken when the
// attendee was added to the schedule — if their Employee record's manager changes afterward,
// nothing previously touched that row again, so a not-yet-sent survey would still go out (or Cc)
// the old manager. Applied to every send path (initial, resend, cron, reminder) so this is fixed
// automatically everywhere rather than depending on an admin remembering to click "Refresh from
// Roster" first. A survey stage that's ALREADY been sent is untouched — its historical record
// (and the manager it actually went to) stays exactly as sent; only what's about to go out now
// picks up the change.
async function refreshManagerForSend(
  attendee: TrainingScheduleAttendee,
  directory: Map<string, ResolvedStaff>
): Promise<TrainingScheduleAttendee> {
  const fresh = resolveCurrentManagerFields(attendee.staffId, directory)
  if (!fresh) return attendee
  if (fresh.lineManagerName === attendee.lineManagerName && fresh.lineManagerEmail === attendee.lineManagerEmail) {
    return attendee
  }
  await prisma.trainingScheduleAttendee.update({
    where: { id: attendee.id },
    data: { lineManagerName: fresh.lineManagerName, lineManagerEmail: fresh.lineManagerEmail },
  })
  return { ...attendee, lineManagerName: fresh.lineManagerName, lineManagerEmail: fresh.lineManagerEmail }
}

// Concurrency is bounded to mailer.ts's own maxConnections (currently 1 — many company mail
// servers reject a 2nd simultaneous authenticated session per account with what looks like a bad
// password) so this never opens more simultaneous SMTP connections than the transport actually
// supports. A pooled transport still means each send after the first reuses the live connection
// instead of paying a fresh TLS+auth handshake — that's what actually fixed the "7 people took
// over a minute" complaint; running them in parallel was a secondary, and on this mail server
// unsafe, optimization on top of it.
async function runConcurrent<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

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

// additionalCcMode "all" applies the schedule's own additionalCc to every attendee's emails;
// "individual" uses each attendee's own additionalCc instead (left blank = none — that person
// still gets the global defaultCc, applied centrally in sendMail(), just no schedule-level extra).
function scheduleCcFor(schedule: TrainingSchedule, attendee: TrainingScheduleAttendee): string[] {
  return parseCcList(schedule.additionalCcMode === 'individual' ? attendee.additionalCc : schedule.additionalCc)
}

// Sends a given survey stage to some/all attendees of a schedule. Pre and Post-1 go to the
// employee (cc: line manager) since they're self-reported. Post-2 goes to the line manager
// instead (cc: employee), since that's the manager-authored Post-Training Impact Score review,
// not a self-report. Super admins are no longer hardcoded into every Cc — that's now the admin's
// own call via SmtpSettings.defaultCc (Admin -> SMTP Settings), applied centrally in sendMail().
// Marks each successfully-sent attendee's stage timestamp so re-sending only targets who's left.
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

  const schedule = await prisma.trainingSchedule.findUnique({
    where: { id: scheduleId },
    include: { attendees: attendeeIds ? { where: { id: { in: attendeeIds } } } : true },
  })

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
  const sentField = STAGE_SENT_FIELD[stage]
  const respondedField = STAGE_RESPONDED_FIELD[stage]
  const recipientRole = surveyRecipientRole(stage)
  const result: SendSurveyResult = { sent: 0, skipped: [] }

  const targets = attendeeIds
    ? schedule.attendees
    : schedule.attendees.filter((a) => (onlyUnsent ? !a[sentField] : !a[respondedField]))

  // One pooled transport reused for every attendee in this call, instead of a fresh SMTP
  // connection + handshake per email — and actually sent with bounded concurrency (matching the
  // pool's own maxConnections), not one at a time, since a sequential await loop never uses more
  // than one pooled connection regardless of how many are available.
  const directory = await loadRosterDirectory()
  const mailer = await createMailSender()
  try {
    await runConcurrent(targets, 1, async (attendeeBefore) => {
      const attendee = await refreshManagerForSend(attendeeBefore, directory)
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
        return
      }

      const cc = [...(ccAddress ? [ccAddress] : []), ...scheduleCcFor(schedule, attendee)]
      const { subject, html } = buildSurveyEmail({
        stage,
        recipientName: recipientName || 'there',
        employeeName: attendee.staffName,
        trainingName: schedule.trainingName,
        formUrl: `${baseUrl}/survey/${attendee.surveyToken}/${stage}`,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        trainingType: schedule.trainingType,
        trainingMode: schedule.trainingMode,
        location: schedule.location,
        meetingLink: schedule.meetingLink,
        isHistorical: schedule.sourcedFromHistoricalData,
      })
      try {
        await mailer.send({ to: toAddress, cc, subject, html })
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
    })
  } finally {
    mailer.close()
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
  settings: { expiryEnabled: boolean; expiryDays: number; excludeDefaultCcOnReminders?: boolean },
  // Set by the admin's manual "Send Reminders to Everyone Outstanding" button — a deliberate,
  // one-off nudge that should reach EVERYONE still unresponded right now, including people the
  // daily sweep has stopped nudging because their survey expired, and regardless of whether
  // today's automated reminder already went out. The daily cron never sets this.
  options: { force?: boolean } = {}
): Promise<SendSurveyResult> {
  const result: SendSurveyResult = { sent: 0, skipped: [] }
  if (!(await hasSmtpCredentials())) return result
  // remindersEnabled is a deliberate per-schedule admin decision (Admin -> Survey Automation ->
  // Reminders: On/Off) — force only bypasses expiry and the once-per-day dedupe below, never this.
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
    if (options.force) return true
    if (settings.expiryEnabled && now - sentAt.getTime() >= settings.expiryDays * DAY_MS) return false
    const lastNudge = a[reminderField] || sentAt
    return lastNudge.toISOString().slice(0, 10) !== todayKey
  })
  if (due.length === 0) return result

  const baseUrl = getAppBaseUrl()
  const recipientRole = surveyRecipientRole(stage)

  const directory = await loadRosterDirectory()
  const mailer = await createMailSender()
  try {
    await runConcurrent(due, 1, async (attendeeBefore) => {
      const attendee = await refreshManagerForSend(attendeeBefore, directory)
      const toAddress = recipientRole === 'manager' ? attendee.lineManagerEmail : attendee.email
      const recipientName = recipientRole === 'manager' ? attendee.lineManagerName : attendee.staffName
      const ccAddress = recipientRole === 'manager' ? attendee.email : attendee.lineManagerEmail
      if (!toAddress) return // already reported as skipped by the original send

      const cc = [...(ccAddress ? [ccAddress] : []), ...scheduleCcFor(schedule, attendee)]
      const { subject, html } = buildSurveyEmail({
        stage,
        recipientName: recipientName || 'there',
        employeeName: attendee.staffName,
        trainingName: schedule.trainingName,
        formUrl: `${baseUrl}/survey/${attendee.surveyToken}/${stage}`,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        trainingType: schedule.trainingType,
        trainingMode: schedule.trainingMode,
        location: schedule.location,
        meetingLink: schedule.meetingLink,
        isReminder: true,
        isHistorical: schedule.sourcedFromHistoricalData,
      })
      try {
        await mailer.send({ to: toAddress, cc, subject, html, skipDefaultCc: settings.excludeDefaultCcOnReminders })
        await prisma.trainingScheduleAttendee.update({ where: { id: attendee.id }, data: { [reminderField]: new Date() } })
        result.sent++
        await logSend(schedule, stage, attendee, toAddress, true, true, null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Reminder send failed.'
        result.skipped.push({ staffName: attendee.staffName, reason: message })
        await logSend(schedule, stage, attendee, toAddress, true, false, message)
      }
    })
  } finally {
    mailer.close()
  }

  return result
}
