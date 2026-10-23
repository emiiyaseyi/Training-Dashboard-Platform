// Shares the exact visual language established for Custom Survey emails (custom-survey-email.ts)
// and the training surveys before that (survey-email.ts) — same FONT/P/BUTTON conventions.
//
// Nothing below is a hardcoded email body — every PDP email is built from a PDPEmailTemplateData
// (subject/body/buttonLabel/showFallbackLink), admin-editable per cycle via PDPEmailTemplate (see
// pdp-email-templates.ts for the DB-backed resolver). PDP_DEFAULT_EMAIL_TEMPLATES below is only the
// starting point a new cycle gets before an admin customizes anything — it goes through the exact
// same token-substitution/rendering path as a customized template, never a separate code path.
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

const FONT = 'font-family:Tahoma,Geneva,sans-serif;font-size:12px;'
const P = (html: string, extraStyle = '') => `<p style="margin:0 0 14px 0;line-height:1.5;${FONT}${extraStyle}">${html}</p>`
const SURVEY_BUTTON_GREEN = '#1E7145'
const BUTTON = (href: string, label: string, showFallbackLink: boolean) => `
  ${P(`<a href="${href}" style="display:inline-block;background:${SURVEY_BUTTON_GREEN};color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;${FONT}">${label}</a>`)}
  ${showFallbackLink ? P(`If the button doesn't work, copy this link into your browser:<br/>${href}`, 'color:#6B7280;') : ''}
`
const SIGNOFF = P('Regards,<br/>Learning &amp; Development')

export function formatDeadline(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export type PDPEmailKind = 'staffSurvey' | 'managerValidation' | 'managerTeam'

export interface PDPEmailTemplateData {
  subject: string
  // Paragraphs separated by a blank line. A block starting with '<' is treated as already-complete
  // markup (used for the review-criteria list etc.) and passed through as-is instead of wrapped in
  // a <p>; every other block gets the standard paragraph styling.
  body: string
  buttonLabel: string
  showFallbackLink: boolean
}

export const PDP_EMAIL_TOKENS: Record<PDPEmailKind, string[]> = {
  staffSurvey: ['firstName', 'cycleTitle', 'deadline'],
  managerValidation: ['firstName', 'staffName', 'cycleTitle', 'deadline'],
  managerTeam: ['firstName', 'cycleTitle', 'deadline'],
}

const REMINDER_BANNER: Record<PDPEmailKind, string> = {
  staffSurvey: "Reminder: we haven't received your Personal Development Plan Survey yet.",
  managerValidation: 'Reminder: this review is still outstanding.',
  managerTeam: "Reminder: your team's Development Plan submissions are still outstanding.",
}

export const PDP_DEFAULT_EMAIL_TEMPLATES: Record<PDPEmailKind, PDPEmailTemplateData> = {
  staffSurvey: {
    subject: '{{cycleTitle}} Survey',
    buttonLabel: 'Complete My Survey',
    showFallbackLink: false,
    body: `Dear {{firstName}},

As we commence preparations for Meristem's 2027 Training Plan, all employees are required to complete the <strong>{{cycleTitle}} Survey</strong>.

The survey is designed to identify the skills, knowledge, and capabilities required to perform effectively in your current role, contribute to your team's objectives, and support Meristem's business priorities and six strategic capabilities.

When completing the survey, please ensure that your responses reflect your actual development needs, identified skills gaps, and the areas where improved competence would enhance your performance and contribution to the business.

<strong>Submission Deadline:</strong> {{deadline}}

Please note that all submissions will be reviewed by your line manager before being consolidated by Learning &amp; Development. Submission of a development need does not automatically guarantee training approval, as proposed interventions will be assessed based on business relevance, priority, feasibility, and available resources.

Kindly complete the survey within the stipulated timeline and ensure your responses are accurate and well considered.

Thank you for your cooperation.`,
  },
  managerValidation: {
    subject: "Action Required: Review and Validation of {{staffName}}'s {{cycleTitle}}",
    buttonLabel: 'Review Development Plan',
    showFallbackLink: false,
    body: `Dear {{firstName}},

As part of preparations for Meristem's 2027 Training Plan, <strong>{{staffName}}</strong> has submitted their {{cycleTitle}} survey.

You are required to review and validate {{staffName}}'s submission to ensure that the identified development needs are relevant to their role, supported by evidence where applicable, and aligned with team objectives, business requirements, and Meristem's six strategic capabilities.

During your review, please pay particular attention to the following:

<ul style="margin:0;padding-left:18px;">
  <li><strong>Role relevance:</strong> Confirm that the identified skills gaps relate to the employee's responsibilities and expected performance.</li>
  <li><strong>Business alignment:</strong> Ensure the proposed development needs support your team's priorities and wider business objectives.</li>
  <li><strong>Priority:</strong> Identify the development needs that are most critical for effective performance and delivery in 2027.</li>
  <li><strong>Workplace application:</strong> Confirm that the expected improvement can be demonstrated or measured on the job.</li>
  <li><strong>Appropriate intervention:</strong> Consider whether the need is best addressed through formal training, digital learning, practical assignments, coaching, knowledge sharing, or other development methods.</li>
</ul>

For each development need, you will also be asked to rate {{staffName}}'s current proficiency before the training takes place. This baseline rating is used to measure the impact of the training once it has been delivered, so please give it as accurate a rating as possible.

<strong>Validation Deadline:</strong> {{deadline}}

You'll be able to review what {{staffName}} selected, edit it if needed, and submit the agreed version — {{staffName}} will receive a copy of what you submit.

Thank you for your support.`,
  },
  managerTeam: {
    subject: 'Action Required: Submission of {{cycleTitle}} — Team Plans',
    buttonLabel: "Open My Team's Plans",
    showFallbackLink: false,
    body: `Dear {{firstName}},

As part of preparations for Meristem's 2027 Training Plan, you are required to complete a Personal Development Plan for each member of your team.

The objective is to identify the skills gaps and development needs for each person, so that these can be translated into a prioritised team plan that addresses critical capability gaps and supports your team's objectives and Meristem's business priorities.

The link below first shows your team list — confirm it (you can remove anyone who shouldn't be there, or add someone missing) — then fill one page per person, pre-filled with a starting point for each.

<strong>Submission Deadline:</strong> {{deadline}}

Please ensure that your submissions reflect the collective development priorities of your team rather than simply compiling individual course requests. Where multiple employees have similar needs, consider opportunities for group training or shared learning interventions.

Learning &amp; Development will review the submissions across business units to identify common capability gaps, prioritise interventions, consolidate requirements, and develop the overall 2027 Training Plan, subject to business priorities, budget availability, and applicable approval processes.

Thank you for your collaboration and commitment to building the capabilities required for improved performance in 2027.`,
  },
}

function substituteTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => tokens[key] ?? '')
}

// Only actual block-level tags (list/table/heading/div) count as "already complete markup" and
// skip the <p> wrap — an inline tag like <strong>Validation Deadline:</strong> ... also starts
// with '<' but is still a plain paragraph that needs its own <p>, just like any other block; a
// bare startsWith('<') check wrongly swallowed those into the surrounding flow with no block
// separation at all (caught by rendering an actual sample email and reading the generated HTML,
// not just reasoning about the regex).
const BLOCK_TAG_RE = /^<(ul|ol|table|div|h[1-6])\b/i
function renderBody(body: string, tokens: Record<string, string>): string {
  const substituted = substituteTokens(body, tokens)
  return substituted
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => (BLOCK_TAG_RE.test(block) ? block : P(block)))
    .join('\n')
}

export function renderPDPEmail(
  kind: PDPEmailKind,
  template: PDPEmailTemplateData,
  tokens: Record<string, string>,
  formUrl: string,
  isReminder?: boolean
): { subject: string; html: string } {
  const subject = `${isReminder ? 'Reminder: ' : ''}${substituteTokens(template.subject, tokens)}`
  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${isReminder ? P(REMINDER_BANNER[kind], 'color:#C9A24B;font-weight:600;') : ''}
      ${renderBody(template.body, tokens)}
      ${BUTTON(formUrl, template.buttonLabel, template.showFallbackLink)}
      ${SIGNOFF}
    </div>
  `
  return { subject, html }
}
