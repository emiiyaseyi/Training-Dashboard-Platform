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

const BUTTON = (href: string, label: string) => `
  <p>
    <a href="${href}" style="display:inline-block;background:#1E2761;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
      ${label}
    </a>
  </p>
  <p style="font-size:13px;color:#6B7280;">If the button doesn't work, copy this link into your browser:<br/>${href}</p>
`

const SIGNOFF = `<p>Best Regards,<br/>Meristem Learning &amp; Development Team</p>`

export function buildSurveyEmail(input: {
  stage: SurveyStage
  recipientName: string // who the email greets — the employee for pre/post1, the manager for post2
  employeeName: string // whose training this is about (may equal recipientName)
  trainingName: string
  formUrl: string
  startDate?: Date | string | null
  endDate?: Date | string | null
  trainingType?: string | null
}): { subject: string; html: string } {
  const { stage, recipientName, employeeName, trainingName, formUrl, startDate, endDate, trainingType } = input
  const firstName = firstNameOf(recipientName)
  const subject = `${STAGE_LABELS[stage]}: ${trainingName}`

  const wrap = (bodyHtml: string) => `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1B1F3B; max-width: 560px;">
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
        <p>Dear ${firstName},</p>
        <p>You have been nominated to attend the ${trainingName} programme ${scheduleLine}${typeLine}.</p>
        <p>As part of your preparation, kindly complete the pre-training survey using the link below:</p>
        ${BUTTON(formUrl, 'Pre-Training Survey')}
        <p>Kindly note that the training provider will communicate further details, including venue and time, in due course.</p>
        <p>We trust this will be a valuable learning experience.</p>
        ${SIGNOFF}
      `),
    }
  }

  if (stage === 'post1') {
    return {
      subject,
      html: wrap(`
        <p>Dear ${firstName},</p>
        <p>Thank you for participating in the ${trainingName}.</p>
        <p>As part of our learning evaluation process, kindly complete the post-training survey using the link below:</p>
        ${BUTTON(formUrl, 'Post-Training Survey')}
        <p>In addition, kindly prepare for a Knowledge Sharing Session (KSS) to share the key insights and practical takeaways from the programme with your team. You are to share your presentation slides ahead of the session and communicate your preferred KSS date and time with the Learning &amp; Development Team as soon as possible.</p>
        <p>Your feedback is important and will help us assess the impact of the programme and improve future learning initiatives.</p>
        <p>Thank you for your participation, and we look forward to receiving your feedback.</p>
        ${SIGNOFF}
      `),
    }
  }

  // post2 — sent to the line manager
  return {
    subject,
    html: wrap(`
      <p>Dear ${firstName},</p>
      <p>${firstNameOf(employeeName)} recently attended the ${trainingName} programme.</p>
      <p>Kindly complete the Training Impact Survey using the link below to provide your assessment of the participant's application of the knowledge and skills gained from the training.</p>
      ${BUTTON(formUrl, 'Training Impact Survey')}
      <p>Your feedback will help us understand the value the training has delivered and identify areas for further development.</p>
      <p>Thank you for your support.</p>
      ${SIGNOFF}
    `),
  }
}
