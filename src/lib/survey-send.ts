import { prisma } from '@/lib/prisma'
import { sendMail, hasSmtpCredentials } from '@/lib/mailer'
import { buildSurveyEmail, surveyRecipientRole, type SurveyStage } from '@/lib/survey-email'

const STAGE_SENT_FIELD = {
  pre: 'preSurveySentAt',
  post1: 'post1SurveySentAt',
  post2: 'post2SurveySentAt',
} as const

const STAGE_URL_FIELD = {
  pre: 'preSurveyFormUrl',
  post1: 'post1SurveyFormUrl',
  post2: 'post2SurveyFormUrl',
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
export async function sendSurveyStage(scheduleId: string, stage: SurveyStage, attendeeIds?: string[]): Promise<SendSurveyResult> {
  if (!hasSmtpCredentials()) {
    throw new Error('SMTP is not configured on the server. Set SMTP_HOST/PORT/USER/PASS in environment variables first.')
  }

  const [schedule, settings, superAdmins] = await Promise.all([
    prisma.trainingSchedule.findUnique({
      where: { id: scheduleId },
      include: { attendees: attendeeIds ? { where: { id: { in: attendeeIds } } } : true },
    }),
    prisma.surveySettings.findFirst(),
    prisma.user.findMany({ where: { isSuperAdmin: true, isActive: true }, select: { email: true } }),
  ])

  if (!schedule) throw new Error('Training schedule not found.')

  const formUrl = settings?.[STAGE_URL_FIELD[stage]]
  if (!formUrl) {
    throw new Error('No Google Form link configured for this survey stage yet — set it in Admin → Survey Automation.')
  }

  const superAdminEmails = superAdmins.map((u) => u.email).filter((e): e is string => !!e)
  const sentField = STAGE_SENT_FIELD[stage]
  const recipientRole = surveyRecipientRole(stage)
  const result: SendSurveyResult = { sent: 0, skipped: [] }

  for (const attendee of schedule.attendees) {
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
      formUrl,
    })
    try {
      await sendMail({ to: toAddress, cc, subject, html, fromName: settings?.fromName })
      await prisma.trainingScheduleAttendee.update({ where: { id: attendee.id }, data: { [sentField]: new Date() } })
      result.sent++
    } catch (err) {
      result.skipped.push({ staffName: attendee.staffName, reason: err instanceof Error ? err.message : 'Send failed.' })
    }
  }

  return result
}
