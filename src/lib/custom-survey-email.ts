function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

// Shares the exact visual language (fonts/spacing/button color) established for the training
// surveys in survey-email.ts — same FONT/P/BUTTON conventions, kept local here since a Custom
// Survey's copy is generic (no training name, no employee/manager framing) rather than a
// parameterised variant of that file's stage-specific templates.
const FONT = 'font-family:Tahoma,Geneva,sans-serif;font-size:12px;'
const P = (html: string, extraStyle = '') => `<p style="margin:0 0 14px 0;line-height:1.5;${FONT}${extraStyle}">${html}</p>`
const SURVEY_BUTTON_GREEN = '#1E7145'
const BUTTON = (href: string, label: string) => `
  ${P(`<a href="${href}" style="display:inline-block;background:${SURVEY_BUTTON_GREEN};color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;${FONT}">${label}</a>`)}
  ${P(`If the button doesn't work, copy this link into your browser:<br/>${href}`, 'color:#6B7280;')}
`
const SIGNOFF = P('Best Regards,<br/>Meristem Learning &amp; Development Team')

export function buildCustomSurveyEmail(input: {
  title: string
  description?: string | null
  recipientName: string
  formUrl: string
  isReminder?: boolean
}): { subject: string; html: string } {
  const { title, description, recipientName, formUrl, isReminder } = input
  const firstName = firstNameOf(recipientName)
  const subject = `${isReminder ? 'Reminder: ' : ''}${title}`

  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${isReminder ? P('Reminder: we haven\'t received your response yet.', 'color:#C9A24B;font-weight:600;') : ''}
      ${P(`Dear ${firstName},`)}
      ${P(`You've been asked to complete the following survey: <strong>${title}</strong>.`)}
      ${description ? P(description) : ''}
      ${P('Kindly complete it using the link below:')}
      ${BUTTON(formUrl, 'Open Survey')}
      ${SIGNOFF}
    </div>
  `
  return { subject, html }
}
