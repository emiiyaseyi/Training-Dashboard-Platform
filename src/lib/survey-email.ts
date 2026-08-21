export type SurveyStage = 'pre' | 'post1' | 'post2'

export const STAGE_LABELS: Record<SurveyStage, string> = {
  pre: 'Pre-Training Survey',
  post1: 'Post-Training Survey',
  post2: 'Training Impact Survey',
}

// Pre and Post-1 are filled by the employee themselves. Post-2 is filled by the line manager,
// rating the employee's post-training impact — it feeds the existing manager-authored
// Post-Training Impact Score, not a self-reported metric, so the recipient flips for this stage.
export function surveyRecipientRole(stage: SurveyStage): 'employee' | 'manager' {
  return stage === 'post2' ? 'manager' : 'employee'
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// "a/an" for whatever Training Type is configured (e.g. "an External Training" vs "a Workshop") —
// the only mechanical grammar fix applied; the wording itself follows the agreed email copy as-is.
function articleFor(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

// N working days (Mon-Fri) after a given date, skipping weekends entirely.
function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const day = result.getDay()
    if (day !== 0 && day !== 6) added++
  }
  return result
}

// Outlook (the client these went out through) ignores CSS margin collapsing AND font inheritance
// from a parent element almost entirely — its Word rendering engine falls back to its own default
// font/size on any element that doesn't carry its own explicit style, which is why the body read
// as smaller than a normal Outlook-composed email despite the wrapping <div> saying Tahoma 12px.
// Every paragraph goes through P() so font, size, and spacing are all repeated on every element.
const FONT = 'font-family:Tahoma,Geneva,sans-serif;font-size:12px;'
const P = (html: string, extraStyle = '') => `<p style="margin:0 0 14px 0;line-height:1.5;${FONT}${extraStyle}">${html}</p>`

// Survey CTA green — sampled visually from the shade the admin specified; adjust SURVEY_BUTTON_GREEN
// if it doesn't match exactly (a hex code would let us match it precisely).
const SURVEY_BUTTON_GREEN = '#1E7145'

const BUTTON = (href: string, label: string) => `
  ${P(`<a href="${href}" style="display:inline-block;background:${SURVEY_BUTTON_GREEN};color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;${FONT}">${label}</a>`)}
  ${P(`If the button doesn't work, copy this link into your browser:<br/>${href}`, 'color:#6B7280;')}
`

const SIGNOFF = P('Best Regards,<br/>Meristem Learning &amp; Development Team')

export function buildSurveyEmail(input: {
  stage: SurveyStage
  recipientName: string // who the email greets — the employee for pre/post1, the manager for post2
  employeeName: string // whose training this is about (may equal recipientName)
  trainingName: string
  formUrl: string
  startDate?: Date | string | null
  endDate?: Date | string | null
  trainingType?: string | null
  isReminder?: boolean // prefixes the subject and adds a short nudge line — used by the daily reminder sweep
  isHistorical?: boolean // sent via "Already Attended Trainings" (retroactively created schedule) — adds a duplicate-fill caveat to Post-1 and reframes Post-2's intro
}): { subject: string; html: string } {
  const { stage, recipientName, employeeName, trainingName, formUrl, startDate, endDate, trainingType, isReminder, isHistorical } = input
  const firstName = firstNameOf(recipientName)
  const subject = stage === 'pre'
    ? `${isReminder ? 'Reminder: ' : ''}Nomination for Training: ${trainingName}${startDate && endDate ? ` (${fmtDate(startDate)} to ${fmtDate(endDate)})` : ''}`
    : `${isReminder ? 'Reminder: ' : ''}${STAGE_LABELS[stage]}: ${trainingName}`

  const wrap = (bodyHtml: string) => `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${isReminder ? P('Reminder: we haven\'t received your response yet.', 'color:#C9A24B;font-weight:600;') : ''}
      ${bodyHtml}
    </div>
  `

  if (stage === 'pre') {
    const scheduleLine = startDate && endDate
      ? `scheduled to hold from ${fmtDate(startDate)} to ${fmtDate(endDate)}`
      : 'scheduled to hold soon'
    const typeLine = trainingType ? ` and it will be ${articleFor(trainingType)} ${trainingType} training` : ''
    return {
      subject,
      html: wrap(`
        ${P(`Dear ${firstName},`)}
        ${P(`You have been nominated to attend the ${trainingName} programme ${scheduleLine}${typeLine}.`)}
        ${P('As part of your preparation, kindly complete the pre-training survey using the link below:')}
        ${BUTTON(formUrl, 'Pre-Training Survey')}
        ${P('Kindly note that the training provider will communicate further details, including venue and time, in due course.')}
        ${P('We trust this will be a valuable learning experience.')}
        ${SIGNOFF}
      `),
    }
  }

  if (stage === 'post1') {
    // KSS is due within 10 working days of the training ending — computed from endDate so the
    // email states a real date instead of a vague "as soon as possible".
    const kssDeadline = endDate ? fmtDate(addWorkingDays(new Date(endDate), 10)) : null
    const kssDeadlineText = kssDeadline ? `on or before ${kssDeadline}` : 'within 10 working days of the training ending'
    return {
      subject,
      html: wrap(`
        ${P(`Dear ${firstName},`)}
        ${P(`Thank you for participating in the ${trainingName}.`)}
        ${P('As part of our learning evaluation process, kindly complete the post-training survey using the link below:')}
        ${BUTTON(formUrl, 'Post-Training Survey')}
        ${P(`In addition, kindly prepare for a Knowledge Sharing Session (KSS) to share the key insights and practical takeaways from the programme with your team. You are to share your presentation slides ahead of the session and communicate your preferred KSS date and time with the Learning &amp; Development Team ${kssDeadlineText}.`)}
        ${isHistorical ? P('If you have previously completed a post-training survey for this programme, please disregard this email.', 'color:#6B7280;') : ''}
        ${P('Your feedback is important and will help us assess the impact of the programme and improve future learning initiatives.')}
        ${P('Thank you for your participation, and we look forward to receiving your feedback.')}
        ${SIGNOFF}
      `),
    }
  }

  // post2 — sent to the line manager
  return {
    subject,
    html: wrap(`
      ${P(`Dear ${firstName},`)}
      ${isHistorical
        ? P(`${firstNameOf(employeeName)} attended the ${trainingName} programme. Post-training impact reviews are now being tracked as part of our learning records, and we kindly request your input in completing this review.`)
        : P(`${firstNameOf(employeeName)} recently attended the ${trainingName} programme.`)}
      ${P('Kindly complete the Training Impact Survey using the link below to provide your assessment of the participant\'s application of the knowledge and skills gained from the training.')}
      ${BUTTON(formUrl, 'Training Impact Survey')}
      ${P('Your feedback will help us understand the value the training has delivered and identify areas for further development.')}
      ${P('Thank you for your support.')}
      ${SIGNOFF}
    `),
  }
}
