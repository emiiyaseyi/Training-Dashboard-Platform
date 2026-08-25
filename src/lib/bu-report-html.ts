import { REPORT_COLORS } from '@/lib/report-theme'
import { fmt, pct } from '@/lib/slide-format'
import type { BUReportComparison, MetricDelta } from '@/lib/bu-report-comparison'

// The print-friendly HTML page puppeteer renders to PDF for the automated BU report email —
// generated as a plain string and handed to page.setContent(), never served over HTTP, so there's
// no self-referential fetch/auth concern for the headless browser to deal with. Shares the same
// color tokens as the PPTX deck (bu-report-pptx.ts) so the two attachments read as one report.

const C = REPORT_COLORS

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function monthYearLabel(year: number, monthIdx: number): string {
  return new Date(year, monthIdx, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

function deltaArrowColor(delta: MetricDelta): { arrow: string; color: string } {
  if (delta.deltaAbs === 0) return { arrow: '—', color: C.gray }
  return delta.deltaAbs > 0 ? { arrow: '▲', color: C.green } : { arrow: '▼', color: C.red }
}

function formatMetricValue(label: string, value: number): string {
  if (label.includes('%')) return pct(value)
  if (label.includes('Score')) return `${value.toFixed(1)}/5`
  if (label === 'Staff Trained') return value.toLocaleString()
  return fmt(value)
}

function deltaTableHtml(title: string, currentLabel: string, previousLabel: string, deltas: MetricDelta[]): string {
  const rows = deltas.map((d) => {
    const { arrow, color } = deltaArrowColor(d)
    const changeText = d.deltaPct === null ? `${arrow} n/a (was 0)` : `${arrow} ${d.deltaPct > 0 ? '+' : ''}${d.deltaPct.toFixed(1)}%`
    return `
      <tr>
        <td class="metric-name">${escapeHtml(d.label)}</td>
        <td class="metric-num muted">${formatMetricValue(d.label, d.previous)}</td>
        <td class="metric-num strong">${formatMetricValue(d.label, d.current)}</td>
        <td class="metric-num strong" style="color:${color}">${changeText}</td>
      </tr>`
  }).join('')

  return `
    <h2>${escapeHtml(title)}</h2>
    <table class="delta-table">
      <thead>
        <tr><th>Metric</th><th class="metric-num">${escapeHtml(previousLabel)}</th><th class="metric-num">${escapeHtml(currentLabel)}</th><th class="metric-num">Change</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

export function buildBUReportHtml(businessUnit: string, comparison: BUReportComparison): string {
  const periodLabel = monthYearLabel(comparison.year, comparison.monthIdx)
  const prevMonthIdx = comparison.monthIdx === 0 ? 11 : comparison.monthIdx - 1
  const prevYear = comparison.monthIdx === 0 ? comparison.year - 1 : comparison.year
  const previousLabel = monthYearLabel(prevYear, prevMonthIdx)
  const c = comparison.currentMonth
  const coverageColor = c.coverageRatio >= 70 ? C.green : c.coverageRatio >= 40 ? C.gold : C.red
  const impactColor = c.avgImpactScore >= 4 ? C.green : C.gold

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 22mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; color: ${C.navy}; margin: 0; }
  h1 { font-family: Georgia, serif; font-size: 26px; color: ${C.navy}; margin: 0 0 4px 0; }
  h2 { font-size: 15px; color: ${C.navy}; margin: 28px 0 10px 0; }
  .subtitle { font-size: 13px; color: ${C.gray}; margin: 0 0 24px 0; }
  .headline { display: flex; gap: 14px; margin-bottom: 8px; }
  .card { flex: 1; background: ${C.panelBg}; border: 1px solid ${C.navyLight}; border-radius: 8px; padding: 14px 16px; }
  .card .label { font-size: 11px; color: ${C.gray}; margin-bottom: 6px; }
  .card .value { font-family: Georgia, serif; font-size: 26px; font-weight: bold; }
  .narrative { font-size: 12.5px; color: ${C.gray}; line-height: 1.6; margin-top: 18px; }
  table.delta-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.delta-table th { background: ${C.navy}; color: #fff; text-align: left; padding: 8px 10px; }
  table.delta-table td { padding: 7px 10px; border-bottom: 1px solid ${C.navyLight}; }
  table.delta-table tr:nth-child(even) td { background: ${C.panelBg}; }
  .metric-num { text-align: right; }
  .metric-name { color: ${C.navy}; }
  .muted { color: ${C.gray}; }
  .strong { font-weight: bold; color: ${C.navy}; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid ${C.navyLight}; font-size: 10px; color: ${C.gray}; }
</style>
</head>
<body>
  <h1>${escapeHtml(businessUnit)}</h1>
  <p class="subtitle">Learning &amp; Development Investment Report — ${escapeHtml(periodLabel)}</p>

  <div class="headline">
    <div class="card">
      <div class="label">Total Learning Investment</div>
      <div class="value" style="color:${C.navy}">${fmt(c.totalInvestment)}</div>
    </div>
    <div class="card">
      <div class="label">Staff Coverage</div>
      <div class="value" style="color:${coverageColor}">${pct(c.coverageRatio)}</div>
    </div>
    <div class="card">
      <div class="label">Avg Impact Score</div>
      <div class="value" style="color:${impactColor}">${c.avgImpactScore.toFixed(1)}/5</div>
    </div>
  </div>
  <p class="narrative">
    This report compares ${escapeHtml(businessUnit)}'s ${escapeHtml(periodLabel)} learning investment against ${escapeHtml(previousLabel)}.
    ${comparison.quarterly ? `It also includes the ${escapeHtml(comparison.quarterly.quarterLabel)} quarterly comparison, since this month closes out the quarter.` : ''}
  </p>

  ${deltaTableHtml(`Month-over-Month — ${previousLabel} vs ${periodLabel}`, periodLabel, previousLabel, comparison.monthlyDeltas)}
  ${comparison.quarterly ? deltaTableHtml(`Quarter-over-Quarter — ${comparison.quarterly.previousQuarterLabel} vs ${comparison.quarterly.quarterLabel}`, comparison.quarterly.quarterLabel, comparison.quarterly.previousQuarterLabel, comparison.quarterly.quarterlyDeltas) : ''}

  <div class="footer">Meristem Group &nbsp;|&nbsp; Learning &amp; Development Investment Report &nbsp;|&nbsp; ${escapeHtml(periodLabel)}</div>
</body>
</html>`
}
