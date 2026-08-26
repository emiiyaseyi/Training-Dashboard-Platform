import { getAppBaseUrl } from '@/lib/app-url'
import { fmt, pct } from '@/lib/slide-format'
import type { BUReportComparison, MetricDelta } from '@/lib/bu-report-comparison'

// The email body is a SUMMARY only — full detail lives in the attached PDF/PPTX (see
// bu-report-html.ts / bu-report-pptx.ts), per the agreed design: "body covers a summary... the
// attachment will show it in details."

// Same font enforcement as survey-email.ts: !important on every level (table cell, <p>, and the
// <span> wrapping the text) — without it, Outlook's Word engine can still substitute its own
// default font/size even when every element already carries an explicit style.
const FONT = 'font-family:Tahoma,Geneva,sans-serif !important;font-size:12px !important;'
const P = (html: string, extraStyle = '') => `<p style="margin:0 0 14px 0;line-height:1.6;${FONT}${extraStyle}"><span style="${FONT}${extraStyle}">${html}</span></p>`

function monthYearLabel(year: number, monthIdx: number): string {
  return new Date(year, monthIdx, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function formatMetricValue(label: string, value: number): string {
  if (label.includes('%')) return pct(value)
  if (label.includes('Score')) return `${value.toFixed(1)}/5`
  if (label === 'Staff Trained') return value.toLocaleString()
  return fmt(value)
}

// Every metric read out as a plain directional fact, not a judgement call — "up" isn't
// automatically framed as good news (more spend isn't inherently positive) so the copy stays
// factual and lets the reader draw their own conclusion.
function highlightLine(d: MetricDelta): string {
  const direction = d.deltaAbs > 0 ? 'up' : d.deltaAbs < 0 ? 'down' : 'unchanged'
  const changeText = d.deltaPct === null
    ? 'no comparable figure last month'
    : `${direction} ${Math.abs(d.deltaPct).toFixed(1)}%`
  return `<li style="margin-bottom:6px;">${d.label}: <strong>${formatMetricValue(d.label, d.current)}</strong> (${changeText}, from ${formatMetricValue(d.label, d.previous)})</li>`
}

export function buildBUReportEmail(input: {
  businessUnit: string
  recipientName: string
  loginHint: string // Staff ID if the recipient has one, otherwise their email
  comparison: BUReportComparison
}): { subject: string; html: string } {
  const { businessUnit, recipientName, loginHint, comparison } = input
  const firstName = recipientName.trim().split(/\s+/)[0] || recipientName
  const periodLabel = monthYearLabel(comparison.year, comparison.monthIdx)
  const baseUrl = getAppBaseUrl()

  const subject = `${businessUnit} — Learning & Development Investment Report — ${periodLabel}`

  // Lead with the 3 metrics most likely to matter to a BU head at a glance; the full set is in
  // the attachments' comparison tables.
  const topLabels = ['Total Learning Investment', 'Staff Coverage %', 'Avg Impact Score']
  const monthlyHighlights = comparison.monthlyDeltas.filter((d) => topLabels.includes(d.label))
  const monthlyList = (monthlyHighlights.length > 0 ? monthlyHighlights : comparison.monthlyDeltas.slice(0, 3))
    .map(highlightLine).join('')

  const quarterlyBlock = comparison.quarterly
    ? P(`This month also closes out ${comparison.quarterly.quarterLabel} — a quarter-over-quarter comparison against ${comparison.quarterly.previousQuarterLabel} is included in both attachments.`)
    : ''

  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${FONT}color:#1B1F3B;">
      ${P(`Dear ${firstName},`)}
      ${P(`Attached is ${businessUnit}'s Learning &amp; Development Investment Report for ${periodLabel}, comparing this month against the prior month.`)}
      ${P(`<strong>Highlights:</strong>`)}
      <ul style="margin:0 0 14px 0;padding-left:20px;${FONT}line-height:1.6;">${monthlyList}</ul>
      ${quarterlyBlock}
      ${P('The attached PDF and PowerPoint cover every metric in detail, including the full month-over-month comparison.')}
      ${P(`For the complete, always-current view of ${businessUnit}'s learning data, log in to the platform:`)}
      ${P(`<a href="${baseUrl}/login" style="color:#1E2761;font-weight:600;">${baseUrl}/login</a>`, '')}
      ${P(`Your login: <strong>${loginHint}</strong>`, 'color:#6B7280;')}
      ${P('Best Regards,<br/>Meristem Learning &amp; Development Team')}
    </td></tr></table>
  `

  return { subject, html }
}
