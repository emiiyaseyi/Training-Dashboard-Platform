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
const SIGNOFF = P('Regards,<br/>Learning &amp; Development')

function formatDeadline(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export function buildPDPStaffEmail(input: { cycleTitle: string; recipientName: string; formUrl: string; deadline: Date; isReminder?: boolean }): { subject: string; html: string } {
  const { cycleTitle, recipientName, formUrl, deadline, isReminder } = input
  const firstName = firstNameOf(recipientName)
  const subject = `${isReminder ? 'Reminder: ' : ''}${cycleTitle} Survey`
  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${isReminder ? P('Reminder: we haven\'t received your Personal Development Plan Survey yet.', 'color:#C9A24B;font-weight:600;') : ''}
      ${P(`Dear ${firstName},`)}
      ${P(`As we commence preparations for Meristem's 2027 Training Plan, all employees are required to complete the <strong>${cycleTitle} Survey</strong>.`)}
      ${P('The survey is designed to identify the skills, knowledge, and capabilities required to perform effectively in your current role, contribute to your team\'s objectives, and support Meristem\'s business priorities and six strategic capabilities.')}
      ${P('When completing the survey, please ensure that your responses reflect your actual development needs, identified skills gaps, and the areas where improved competence would enhance your performance and contribution to the business.')}
      ${BUTTON(formUrl, 'Complete My Survey')}
      ${P(`<strong>Submission Deadline:</strong> ${formatDeadline(deadline)}`)}
      ${P('Please note that all submissions will be reviewed by your line manager before being consolidated by Learning &amp; Development. Submission of a development need does not automatically guarantee training approval, as proposed interventions will be assessed based on business relevance, priority, feasibility, and available resources.')}
      ${P('Kindly complete the survey within the stipulated timeline and ensure your responses are accurate and well considered.')}
      ${P('Thank you for your cooperation.')}
      ${SIGNOFF}
    </div>
  `
  return { subject, html }
}

export function buildPDPManagerValidationEmail(input: { cycleTitle: string; staffName: string; managerName: string; formUrl: string; deadline: Date; isReminder?: boolean }): { subject: string; html: string } {
  const { cycleTitle, staffName, managerName, formUrl, deadline, isReminder } = input
  const firstName = firstNameOf(managerName)
  const subject = `${isReminder ? 'Reminder: ' : ''}Action Required: Review and Validation of ${staffName}'s ${cycleTitle}`
  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${isReminder ? P('Reminder: this review is still outstanding.', 'color:#C9A24B;font-weight:600;') : ''}
      ${P(`Dear ${firstName},`)}
      ${P(`As part of preparations for Meristem's 2027 Training Plan, <strong>${staffName}</strong> has submitted their ${cycleTitle} survey.`)}
      ${P(`You are required to review and validate ${staffName}'s submission to ensure that the identified development needs are relevant to their role, supported by evidence where applicable, and aligned with team objectives, business requirements, and Meristem's six strategic capabilities.`)}
      ${P('During your review, please pay particular attention to the following:')}
      ${P(`
        <ul style="margin:0;padding-left:18px;">
          <li><strong>Role relevance:</strong> Confirm that the identified skills gaps relate to the employee's responsibilities and expected performance.</li>
          <li><strong>Business alignment:</strong> Ensure the proposed development needs support your team's priorities and wider business objectives.</li>
          <li><strong>Priority:</strong> Identify the development needs that are most critical for effective performance and delivery in 2027.</li>
          <li><strong>Workplace application:</strong> Confirm that the expected improvement can be demonstrated or measured on the job.</li>
          <li><strong>Appropriate intervention:</strong> Consider whether the need is best addressed through formal training, digital learning, practical assignments, coaching, knowledge sharing, or other development methods.</li>
        </ul>
      `)}
      ${BUTTON(formUrl, 'Review Development Plan')}
      ${P(`<strong>Validation Deadline:</strong> ${formatDeadline(deadline)}`)}
      ${P('Following this exercise, you will be required to submit a consolidated 2027 Training Plan for your team, highlighting the priority interventions required to address capability gaps and deliver team and business objectives.')}
      ${P('Your review is essential to ensuring that the 2027 Training Plan is practical, prioritised, and focused on measurable performance improvement.')}
      ${P('Thank you for your support.')}
      ${SIGNOFF}
    </div>
  `
  return { subject, html }
}

export function buildPDPManagerTeamEmail(input: { cycleTitle: string; managerName: string; formUrl: string; deadline: Date; isReminder?: boolean }): { subject: string; html: string } {
  const { cycleTitle, managerName, formUrl, deadline, isReminder } = input
  const firstName = firstNameOf(managerName)
  const subject = `${isReminder ? 'Reminder: ' : ''}Action Required: Submission of 2027 Team Training Plans`
  const html = `
    <div style="font-family: Tahoma, Geneva, sans-serif; font-size: 12px; color: #1B1F3B; max-width: 560px;">
      ${isReminder ? P('Reminder: your team\'s training plan submission is still outstanding.', 'color:#C9A24B;font-weight:600;') : ''}
      ${P(`Dear ${firstName},`)}
      ${P(`Following the completion and validation of the ${cycleTitle}s, you are required to develop and submit a <strong>consolidated 2027 Training Plan for your team</strong>.`)}
      ${P('The objective is to translate validated individual development needs into a prioritised team plan that addresses critical skills gaps, strengthens role-based competence, and supports your team\'s objectives and Meristem\'s business priorities.')}
      ${P('In preparing your submission, please ensure that the proposed interventions:')}
      ${P(`
        <ol style="margin:0;padding-left:18px;">
          <li>Address validated skills and competency gaps identified through the PDP review.</li>
          <li>Align with your team's 2027 objectives and relevant Meristem strategic capabilities.</li>
          <li>Prioritise critical role requirements, productivity improvement, compliance obligations, and emerging business needs.</li>
          <li>Specify the employees or roles to be covered, the proposed learning intervention, the expected workplace outcome, and the preferred delivery timeline.</li>
          <li>Include estimated costs and proposed providers where known, while considering internal learning options and other cost-effective approaches.</li>
        </ol>
      `)}
      ${P('The link below first shows your team list — confirm it (you can remove anyone who shouldn\'t be there, or add someone missing) — then fill one page per person, pre-filled with a starting point for each.')}
      ${BUTTON(formUrl, 'Open My Team\'s Plans')}
      ${P(`<strong>Submission Deadline:</strong> ${formatDeadline(deadline)}`)}
      ${P('Please ensure that your plan reflects the collective development priorities of your team rather than simply compiling individual course requests. Where multiple employees have similar needs, consider opportunities for group training or shared learning interventions.')}
      ${P('Learning &amp; Development will review the submissions across business units to identify common capability gaps, prioritise interventions, consolidate requirements, and develop the overall 2027 Training Plan, subject to business priorities, budget availability, and applicable approval processes.')}
      ${P('Thank you for your collaboration and commitment to building the capabilities required for improved performance in 2027.')}
      ${SIGNOFF}
    </div>
  `
  return { subject, html }
}
