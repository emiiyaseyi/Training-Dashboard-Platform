// Shares the exact visual language established for Custom Survey emails (custom-survey-email.ts)
// and the training surveys before that (survey-email.ts) — same FONT/P/BUTTON conventions.
function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

const FONT = 'font-family:Tahoma,Geneva,sans-serif;font-size:12px;'
const P = (html: string, extraStyle = '') => `<p style="margin:0 0 14px 0;line-height:1.5;${FONT}${extraStyle}">${html}</p>`
const SURVEY_BUTTON_GREEN = '#1E7145'
const BUTTON = (href: string, label: string) => `
  ${P(`<a href="${href}" style="display:inline-block;background:${SURVEY_BUTTON_GREEN};color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;${FONT}">${label}</a>`)}
  ${P(`If the button doesn't work, copy this link into your browser:<br/>${href}`, 'color:#6B7280;')}
`
const SIGNOFF = P('Best Regards,<br/>Meristem Learning &amp; Development Team')

export function buildPDPStaffEmail(input: { cycleTitle: string; recipientName: string; formUrl: string; isReminder?: boolean }): { subject: string; html: string } {
  const { cycleTitle, recipientName, formUrl, isReminder } = input
  const firstName = firstNameOf(recipientName)
  const subject = `${isReminder ? 'Reminder: ' : ''}${cycleTitle} — Your Personal Development Plan`
  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${isReminder ? P('Reminder: we haven\'t received your Personal Development Plan yet.', 'color:#C9A24B;font-weight:600;') : ''}
      ${P(`Dear ${firstName},`)}
      ${P(`As part of <strong>${cycleTitle}</strong>, please take a few minutes to fill in your Personal Development Plan — it's already pre-filled with a starting point based on your training history, and you can edit or add to it.`)}
      ${P('Your line manager will be asked to review it once you submit.')}
      ${BUTTON(formUrl, 'Fill My PDP')}
      ${SIGNOFF}
    </div>
  `
  return { subject, html }
}

export function buildPDPManagerValidationEmail(input: { cycleTitle: string; staffName: string; managerName: string; formUrl: string; isReminder?: boolean }): { subject: string; html: string } {
  const { cycleTitle, staffName, managerName, formUrl, isReminder } = input
  const firstName = firstNameOf(managerName)
  const subject = `${isReminder ? 'Reminder: ' : ''}${cycleTitle} — Review ${staffName}'s Development Plan`
  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${isReminder ? P('Reminder: this review is still outstanding.', 'color:#C9A24B;font-weight:600;') : ''}
      ${P(`Dear ${firstName},`)}
      ${P(`<strong>${staffName}</strong> has submitted their Personal Development Plan for <strong>${cycleTitle}</strong>. Please review it — you can edit it before confirming.`)}
      ${BUTTON(formUrl, 'Review Development Plan')}
      ${SIGNOFF}
    </div>
  `
  return { subject, html }
}

export function buildPDPManagerTeamEmail(input: { cycleTitle: string; managerName: string; formUrl: string; isReminder?: boolean }): { subject: string; html: string } {
  const { cycleTitle, managerName, formUrl, isReminder } = input
  const firstName = firstNameOf(managerName)
  const subject = `${isReminder ? 'Reminder: ' : ''}${cycleTitle} — Your Team's Development Plans`
  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${isReminder ? P('Reminder: your team\'s development plans are still outstanding.', 'color:#C9A24B;font-weight:600;') : ''}
      ${P(`Dear ${firstName},`)}
      ${P(`As part of <strong>${cycleTitle}</strong>, please fill in a Personal Development Plan for each member of your team. The link below first shows your team list — confirm it (you can remove anyone who shouldn't be there, or add someone missing) — then fill one page per person, pre-filled with a starting point for each.`)}
      ${BUTTON(formUrl, 'Open My Team’s Plans')}
      ${SIGNOFF}
    </div>
  `
  return { subject, html }
}
