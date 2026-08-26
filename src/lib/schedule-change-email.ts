export type ScheduleChangeReason = 'cancelled' | 'rescheduled'

// !important on both properties — without it, Outlook's Word engine can substitute its own
// default font/size even when every element already carries an explicit style (see survey-email.ts).
const FONT = 'font-family:Tahoma,Geneva,sans-serif !important;font-size:12px !important;'
const P = (html: string, extraStyle = '') => `<p style="margin:0 0 14px 0;line-height:1.5;${FONT}${extraStyle}"><span style="${FONT}${extraStyle}">${html}</span></p>`
const SIGNOFF = P('Best Regards,<br/>Meristem Learning &amp; Development Team')

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Sent to every attendee (cc: their line manager, matching the Pre-Training email's own Cc
// convention) when a schedule is removed — one personalised email per person, not a single group
// notice, consistent with how every other survey email already works here.
export function buildScheduleChangeEmail(input: {
  recipientName: string
  trainingName: string
  originalStartDate: Date | string
  originalEndDate: Date | string
  reason: ScheduleChangeReason
  newStartDate?: Date | string | null
  newEndDate?: Date | string | null
  communicateLater?: boolean
}): { subject: string; html: string } {
  const { recipientName, trainingName, originalStartDate, originalEndDate, reason, newStartDate, newEndDate, communicateLater } = input
  const firstName = recipientName.trim().split(/\s+/)[0] || recipientName
  const originalRange = `${fmtDate(originalStartDate)} to ${fmtDate(originalEndDate)}`

  const subject = reason === 'cancelled'
    ? `Cancelled: ${trainingName} (was ${originalRange})`
    : `Rescheduled: ${trainingName} (was ${originalRange})`

  const bodyLine = reason === 'cancelled'
    ? P(`We regret to inform you that the <strong>${trainingName}</strong> training, previously scheduled for ${originalRange}, has been <strong>cancelled</strong>.`)
    : newStartDate && newEndDate
      ? P(`The <strong>${trainingName}</strong> training, previously scheduled for ${originalRange}, has been <strong>rescheduled to ${fmtDate(newStartDate)} to ${fmtDate(newEndDate)}</strong>. You will receive updated communication ahead of the new date.`)
      : P(`The <strong>${trainingName}</strong> training, previously scheduled for ${originalRange}, has been <strong>rescheduled</strong>. ${communicateLater ? 'The new date will be communicated separately once confirmed.' : ''}`)

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${FONT}color:#1B1F3B;">
      ${P(`Dear ${firstName},`)}
      ${bodyLine}
      ${P('Apologies for any inconvenience this may cause.')}
      ${SIGNOFF}
    </td></tr></table>
  `

  return { subject, html }
}
