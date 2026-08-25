import { REPORT_COLORS_HEX } from '@/lib/report-theme'
import { fmt, pct } from '@/lib/slide-format'
import { newPresentation, addHeader, addFooter, MARGIN, PAGE_W, CONTENT_TOP } from '@/lib/pptx-export'
import type { PptxSlide } from '@/lib/pptx-export'
import type { BUReportComparison, MetricDelta } from '@/lib/bu-report-comparison'

// Per-Business-Unit monthly (and, at quarter-end, quarterly) report — a focused 2-3 slide deck,
// distinct from pptx-export.ts's 8-slide group-wide deck. Shares its visual language (same
// header/footer helpers, same color tokens) so a recipient who's seen the group deck recognizes
// this as the same report family.

const C = REPORT_COLORS_HEX

function deltaColor(delta: MetricDelta): string {
  if (delta.deltaAbs === 0) return C.gray
  // Higher spend isn't automatically "good" the way higher coverage/impact is, so every delta is
  // shown as a plain directional fact (color = direction, not judgement) — green for up, red for
  // down — the recipient reads the number in the mail body's narrative for context on whether an
  // increase is welcome.
  return delta.deltaAbs > 0 ? C.green : C.red
}

function formatDeltaValue(delta: MetricDelta): string {
  const isPct = delta.label.includes('%') || delta.label.includes('Score')
  return isPct ? pct(delta.current) : delta.label === 'Staff Trained' ? delta.current.toLocaleString() : fmt(delta.current)
}

function formatDeltaChange(delta: MetricDelta): string {
  const arrow = delta.deltaAbs > 0 ? '▲' : delta.deltaAbs < 0 ? '▼' : '—'
  if (delta.deltaPct === null) return `${arrow} n/a (was 0)`
  const sign = delta.deltaPct > 0 ? '+' : ''
  return `${arrow} ${sign}${delta.deltaPct.toFixed(1)}%`
}

function addDeltaTable(slide: PptxSlide, title: string, currentLabel: string, previousLabel: string, deltas: MetricDelta[], top: number) {
  slide.addText(title, { x: MARGIN, y: top, w: PAGE_W - MARGIN * 2, h: 0.3, fontFace: 'Calibri', fontSize: 13, bold: true, color: C.navy })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [
    [
      { text: 'Metric', options: { bold: true, color: C.white, fill: { color: C.navy } } },
      { text: previousLabel, options: { bold: true, color: C.white, fill: { color: C.navy }, align: 'right' } },
      { text: currentLabel, options: { bold: true, color: C.white, fill: { color: C.navy }, align: 'right' } },
      { text: 'Change', options: { bold: true, color: C.white, fill: { color: C.navy }, align: 'right' } },
    ],
    ...deltas.map((d, i) => [
      { text: d.label, options: { color: C.navy, fill: { color: i % 2 === 0 ? C.white : C.panelBg } } },
      { text: formatDeltaValue({ ...d, current: d.previous }), options: { color: C.gray, align: 'right' as const, fill: { color: i % 2 === 0 ? C.white : C.panelBg } } },
      { text: formatDeltaValue(d), options: { color: C.navy, bold: true, align: 'right' as const, fill: { color: i % 2 === 0 ? C.white : C.panelBg } } },
      { text: formatDeltaChange(d), options: { color: deltaColor(d), bold: true, align: 'right' as const, fill: { color: i % 2 === 0 ? C.white : C.panelBg } } },
    ]),
  ]

  slide.addTable(rows, {
    x: MARGIN, y: top + 0.35, w: PAGE_W - MARGIN * 2,
    fontFace: 'Calibri', fontSize: 11, border: { type: 'solid', color: 'E2E6F0', pt: 0.5 },
    colW: [(PAGE_W - MARGIN * 2) * 0.4, (PAGE_W - MARGIN * 2) * 0.2, (PAGE_W - MARGIN * 2) * 0.2, (PAGE_W - MARGIN * 2) * 0.2],
  })
}

function monthYearLabel(year: number, monthIdx: number): string {
  return new Date(year, monthIdx, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/** Builds a focused 2-3 slide report for one Business Unit and returns it as a Buffer. */
export async function buildBUReportPptxBuffer(businessUnit: string, comparison: BUReportComparison): Promise<Buffer> {
  const pptx = await newPresentation()
  const periodLabel = monthYearLabel(comparison.year, comparison.monthIdx)
  const prevMonthIdx = comparison.monthIdx === 0 ? 11 : comparison.monthIdx - 1
  const prevYear = comparison.monthIdx === 0 ? comparison.year - 1 : comparison.year
  const previousLabel = monthYearLabel(prevYear, prevMonthIdx)

  // Slide 1 — cover / headline numbers
  const cover = pptx.addSlide()
  addHeader(cover, businessUnit, `Learning & Development Investment Report — ${periodLabel}`)
  const c = comparison.currentMonth
  const headline: { label: string; value: string; color: string }[] = [
    { label: 'Total Learning Investment', value: fmt(c.totalInvestment), color: C.navy },
    { label: 'Staff Coverage', value: pct(c.coverageRatio), color: c.coverageRatio >= 70 ? C.green : c.coverageRatio >= 40 ? C.gold : C.red },
    { label: 'Avg Impact Score', value: `${c.avgImpactScore.toFixed(1)}/5`, color: c.avgImpactScore >= 4 ? C.green : C.gold },
  ]
  const cardW = (PAGE_W - MARGIN * 2 - 0.4) / 3
  headline.forEach((h, i) => {
    const x = MARGIN + i * (cardW + 0.2)
    cover.addShape('roundRect', { x, y: CONTENT_TOP, w: cardW, h: 1.7, rectRadius: 0.06, fill: { color: C.panelBg }, line: { color: C.navyLight, width: 0.75 } })
    cover.addText(h.label, { x: x + 0.2, y: CONTENT_TOP + 0.18, w: cardW - 0.4, h: 0.4, fontFace: 'Calibri', fontSize: 12, color: C.gray })
    cover.addText(h.value, { x: x + 0.2, y: CONTENT_TOP + 0.65, w: cardW - 0.4, h: 0.7, fontFace: 'Georgia', fontSize: 30, bold: true, color: h.color })
  })
  cover.addText(
    `This report compares ${businessUnit}'s ${periodLabel} learning investment against ${previousLabel}.${comparison.quarterly ? ` It also includes the ${comparison.quarterly.quarterLabel} quarterly comparison, since this month closes out the quarter.` : ''}`,
    { x: MARGIN, y: CONTENT_TOP + 2.1, w: PAGE_W - MARGIN * 2, h: 1.0, fontFace: 'Calibri', fontSize: 12, color: C.gray, valign: 'top' }
  )
  addFooter(cover, 1, periodLabel)

  // Slide 2 — month-over-month comparison table
  const monthly = pptx.addSlide()
  addHeader(monthly, 'Month-over-Month Comparison', `${previousLabel} vs ${periodLabel}`)
  addDeltaTable(monthly, `${businessUnit} — key metrics`, periodLabel, previousLabel, comparison.monthlyDeltas, CONTENT_TOP)
  addFooter(monthly, 2, periodLabel)

  // Slide 3 — quarter-end only
  if (comparison.quarterly) {
    const q = comparison.quarterly
    const quarterly = pptx.addSlide()
    addHeader(quarterly, 'Quarter-over-Quarter Comparison', `${q.previousQuarterLabel} vs ${q.quarterLabel}`)
    addDeltaTable(quarterly, `${businessUnit} — key metrics`, q.quarterLabel, q.previousQuarterLabel, q.quarterlyDeltas, CONTENT_TOP)
    addFooter(quarterly, 3, periodLabel)
  }

  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
}
