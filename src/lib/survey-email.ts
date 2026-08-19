export type SurveyStage = 'pre' | 'post1' | 'post2'

export const STAGE_LABELS: Record<SurveyStage, string> = {
  pre: 'Pre-Training Survey',
  post1: 'Post-Training Survey (Day 1)',
  post2: 'Manager Post-Training Impact Review (1-Month Follow-up)',
}

// Pre and Post-1 are filled by the employee themselves. Post-2 is filled by the line manager,
// rating the employee's post-training impact — it feeds the existing manager-authored
// Post-Training Impact Score, not a self-reported metric, so the recipient flips for this stage.
export function surveyRecipientRole(stage: SurveyStage): 'employee' | 'manager' {
  return stage === 'post2' ? 'manager' : 'employee'
}

export function buildSurveyEmail(input: {
  stage: SurveyStage
  recipientName: string // who the email greets — the employee for pre/post1, the manager for post2
  employeeName: string // whose training this is about (may equal recipientName)
  trainingName: string
  formUrl: string
}): { subject: string; html: string } {
  const { stage, recipientName, employeeName, trainingName, formUrl } = input
  const label = STAGE_LABELS[stage]
  const subject = `${label}: ${trainingName}`

  const intro =
    stage === 'pre'
      ? `Ahead of your upcoming training, please take a few minutes to complete this short survey.`
      : stage === 'post1'
        ? `Thank you for attending this training. Please share your feedback while it's still fresh.`
        : `It's been a month since ${employeeName}'s training. As their line manager, we'd like your assessment of the impact it's had on their work since then.`

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1B1F3B; max-width: 560px;">
      <p>Hi ${recipientName},</p>
      <p>${intro}</p>
      <p><strong>Training:</strong> ${trainingName}</p>
      <p>
        <a href="${formUrl}" style="display:inline-block;background:#1E2761;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
          Complete the ${label}
        </a>
      </p>
      <p style="font-size:13px;color:#6B7280;">If the button doesn't work, copy this link into your browser:<br/>${formUrl}</p>
      <p>Thank you,<br/>Meristem Learning &amp; Development</p>
    </div>
  `
  return { subject, html }
}
