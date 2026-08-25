import { REPORT_COLORS_HEX } from '@/lib/report-theme'
import { fmt, pct, rating } from '@/lib/slide-format'
import { rasterizeIconBadges } from '@/lib/icon-rasterizer'
import { REPORT_ICON_SPECS } from '@/lib/report-icon-registry'
import type { GroupAnalytics } from '@/lib/analytics'

// Native, editable PPTX generation — mirrors the 7 React slide components 1:1 using pptxgenjs
// shapes/text boxes and *native* PowerPoint charts (addChart), so the output stays editable in
// PowerPoint rather than being a flattened screenshot. Icon badges are rasterized once per export
// (see icon-rasterizer.ts) and embedded as images, since pptxgenjs has no vector icon support.

export const PAGE_W = 13.333
export const PAGE_H = 7.5
export const MARGIN = 0.5
export const CONTENT_TOP = 1.35
export const FOOTER_Y = 7.05

const C = REPORT_COLORS_HEX // bare hex, no leading '#'

export type IconImages = Record<string, string>

export interface Tile {
  iconKey: string
  title: string
  value: string
  subtitle?: string
  valueColor?: string // bare hex
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PptxSlide = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PptxGen = any

export function addHeader(slide: PptxSlide, title: string, subtitle: string) {
  slide.addText(title, {
    x: MARGIN, y: 0.4, w: PAGE_W - MARGIN * 2, h: 0.55,
    fontFace: 'Georgia', fontSize: 28, bold: true, color: C.navy,
  })
  slide.addText(subtitle, {
    x: MARGIN, y: 0.95, w: PAGE_W - MARGIN * 2, h: 0.3,
    fontFace: 'Calibri', fontSize: 13, color: C.gray,
  })
}

export function addFooter(slide: PptxSlide, pageNumber: number, periodLabel: string) {
  slide.addText(`Meristem Group  |  Learning & Development Investment Report  |  ${periodLabel}`, {
    x: MARGIN, y: FOOTER_Y, w: PAGE_W - MARGIN * 2 - 0.6, h: 0.3,
    fontFace: 'Calibri', fontSize: 9, color: C.gray,
  })
  slide.addText(String(pageNumber), {
    x: PAGE_W - MARGIN - 0.5, y: FOOTER_Y, w: 0.5, h: 0.3,
    fontFace: 'Calibri', fontSize: 9, color: C.gray, align: 'right',
  })
  slide.addShape('line', {
    x: MARGIN, y: FOOTER_Y - 0.08, w: PAGE_W - MARGIN * 2, h: 0,
    line: { color: C.navyLight, width: 0.75 },
  })
}

export function addTileGrid(slide: PptxSlide, tiles: Tile[], icons: IconImages, cols: number, top = CONTENT_TOP, bottom = FOOTER_Y - 0.25) {
  const gap = 0.18
  const rows = Math.ceil(tiles.length / cols)
  const tileW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols
  const tileH = (bottom - top - gap * (rows - 1)) / rows

  tiles.forEach((tile, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = MARGIN + col * (tileW + gap)
    const y = top + row * (tileH + gap)

    slide.addShape('roundRect', {
      x, y, w: tileW, h: tileH,
      rectRadius: 0.06,
      fill: { color: C.white },
      line: { color: C.navyLight, width: 0.75 },
    })
    const iconImg = icons[tile.iconKey]
    if (iconImg) {
      slide.addImage({ data: iconImg, x: x + 0.14, y: y + 0.14, w: 0.28, h: 0.28 })
    } else {
      slide.addShape('ellipse', { x: x + 0.14, y: y + 0.14, w: 0.28, h: 0.28, fill: { color: C.navyDark }, line: { type: 'none' } })
    }
    slide.addText(tile.title, {
      x: x + 0.14, y: y + 0.48, w: tileW - 0.28, h: 0.3,
      fontFace: 'Calibri', fontSize: 12, color: C.navy, bold: false,
    })
    slide.addText(tile.value, {
      x: x + 0.14, y: y + 0.76, w: tileW - 0.28, h: 0.42,
      fontFace: 'Georgia', fontSize: 22, bold: true, color: tile.valueColor ?? C.navy,
    })
    if (tile.subtitle) {
      slide.addText(tile.subtitle, {
        x: x + 0.14, y: y + tileH - 0.46, w: tileW - 0.28, h: 0.4,
        fontFace: 'Calibri', fontSize: 9, color: C.gray, valign: 'top',
      })
    }
  })
}

// ── Slide builders ─────────────────────────────────────────────────────────

function buildSlide1(pptx: PptxGen, data: GroupAnalytics, periodLabel: string, icons: IconImages) {
  const slide = pptx.addSlide()
  addHeader(slide, 'Executive Overview', 'Group-wide learning investment at a glance')

  const tiles: Tile[] = [
    { iconKey: 'nairaSign', title: 'Total Learning Investment', value: fmt(data.totalLearningInvestment), subtitle: `${pct(data.trainingSharePct)} training · ${pct(data.otherSharePct)} strategic learnings · ${pct(data.subscriptionSharePct)} subscriptions` },
    { iconKey: 'graduationCap', title: 'Formal Training Spend', value: fmt(data.totalTrainingCost), subtitle: 'PDP Trainings' },
    { iconKey: 'award', title: 'Strategic Learnings', value: fmt(data.totalOtherTrainingCost), subtitle: data.otherTrainingTypeNames.join(', ') || 'Summits, Leadership Cafe, Workshops', valueColor: C.gold },
    { iconKey: 'badgeCheck', title: 'Subscription Spend', value: fmt(data.totalSubscriptionCost), subtitle: 'Professional memberships', valueColor: C.green },
    { iconKey: 'users', title: 'Investment per Staff', value: fmt(data.investmentPerStaff), subtitle: `Across ${data.totalStaffCount.toLocaleString()} total staff`, valueColor: C.gold },
    { iconKey: 'userCheck', title: 'Staff Coverage', value: pct(data.groupCoverageRatio), subtitle: `${data.uniqueStaffTrained} of ${data.totalStaffCount} trained`, valueColor: data.groupCoverageRatio >= 70 ? C.green : data.groupCoverageRatio >= 40 ? C.gold : C.red },
    { iconKey: 'star', title: 'Avg Impact Score', value: rating(data.avgImpactScore), subtitle: 'Based on confidence ratings (max 5)', valueColor: data.avgImpactScore >= 4 ? C.green : C.gold },
    { iconKey: 'barChart2', title: 'Projected Annual Spend', value: fmt(data.forecastedSpend), subtitle: `Budget: ${fmt(data.totalBudget)}`, valueColor: data.budgetRisk === 'over-budget' ? C.red : C.green },
    { iconKey: 'creditCard', title: 'Number of Subscriptions', value: data.topMembershipOrgs.reduce((s, o) => s + o.count, 0).toString(), subtitle: `${data.uniqueSubscriptionStaff} staff covered` },
    { iconKey: 'target', title: 'Trainings vs Role Relevance', value: rating(data.avgRoleRelevance), subtitle: 'How relevant is training to their role?', valueColor: data.avgRoleRelevance >= 4 ? C.green : C.gold },
    { iconKey: 'checkCircle', title: 'Trainings vs Expectations Met', value: rating(data.avgExpectationsMet), subtitle: 'Extent to which expectations were met', valueColor: data.avgExpectationsMet >= 4 ? C.green : C.gold },
    { iconKey: 'shieldCheck', title: `${data.hoursReport.hoursThreshold}-Hour Compliance`, value: `${data.hoursReport.staffMeeting40hPct.toFixed(0)}%`, subtitle: `${data.hoursReport.staffMeeting40h} of ${data.totalStaffCount} staff`, valueColor: data.hoursReport.staffMeeting40hPct >= 80 ? C.green : data.hoursReport.staffMeeting40hPct >= 50 ? C.gold : C.red },
  ]
  addTileGrid(slide, tiles, icons, 4)
  addFooter(slide, 1, periodLabel)
  return slide
}

function buildSlide2(pptx: PptxGen, data: GroupAnalytics, periodLabel: string, icons: IconImages) {
  const slide = pptx.addSlide()
  addHeader(slide, 'Learning Hours Delivered', 'Time invested across formal training and knowledge sharing')
  const h = data.hoursReport

  const tiles: Tile[] = [
    { iconKey: 'clock', title: 'Total Learning Hours', value: `${h.totalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`, subtitle: 'Across all tracked learning activities' },
    { iconKey: 'graduationCap', title: 'Training Hours', value: `${h.totalFormalHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`, subtitle: 'From formal training programmes' },
    { iconKey: 'users', title: 'KSS Hours', value: `${h.totalKSSHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`, subtitle: 'From knowledge sharing sessions', valueColor: C.green },
    { iconKey: 'timer', title: 'Avg Hours per Staff', value: `${h.avgHoursPerStaff.toFixed(1)} hrs`, subtitle: 'Average per employee with learning records', valueColor: C.gold },
    {
      iconKey: 'checkCircle',
      title: 'Post-Training Impact',
      value: data.postTrainingReviewCount > 0 ? rating(data.postTrainingImpactScore) : 'No data',
      subtitle: data.postTrainingReviewCount > 0 ? 'From line manager reviews' : 'Upload manager reviews to populate',
      valueColor: C.green,
    },
  ]
  addTileGrid(slide, tiles, icons, 5, CONTENT_TOP, CONTENT_TOP + 1.6)

  const panelTop = CONTENT_TOP + 1.85
  const panelH = FOOTER_Y - 0.25 - panelTop
  const panelW = (PAGE_W - MARGIN * 2 - 0.2) / 2

  function participationPanel(x: number, title: string, isSub: boolean, p: GroupAnalytics['trainingParticipation']) {
    slide.addShape('roundRect', { x, y: panelTop, w: panelW, h: panelH, rectRadius: 0.06, fill: { color: C.panelBg }, line: { color: C.navyLight, width: 0.75 } })
    slide.addText(title, { x: x + 0.2, y: panelTop + 0.15, w: panelW - 0.4, h: 0.3, fontFace: 'Calibri', fontSize: 13, bold: true, color: C.navy })
    const oneLabel = isSub ? 'Hold exactly 1 subscription' : 'Completed exactly 1'
    const twoLabel = isSub ? 'Hold 2 or more subscriptions' : 'Completed 2 or more'
    slide.addText(`${oneLabel}          ${p.oneTraining.toLocaleString()} (${p.oneTrainingPct.toFixed(1)}%)`, { x: x + 0.2, y: panelTop + 0.6, w: panelW - 0.4, h: 0.3, fontFace: 'Calibri', fontSize: 11, color: C.navy })
    slide.addShape('rect', { x: x + 0.2, y: panelTop + 0.95, w: (panelW - 0.4) * Math.min(1, p.oneTrainingPct / 100), h: 0.1, fill: { color: C.navy }, line: { type: 'none' } })
    slide.addText(`${twoLabel}          ${p.twoPlus.toLocaleString()} (${p.twoPlusPct.toFixed(1)}%)`, { x: x + 0.2, y: panelTop + 1.25, w: panelW - 0.4, h: 0.3, fontFace: 'Calibri', fontSize: 11, color: C.navy })
    slide.addShape('rect', { x: x + 0.2, y: panelTop + 1.6, w: (panelW - 0.4) * Math.min(1, p.twoPlusPct / 100), h: 0.1, fill: { color: C.green }, line: { type: 'none' } })
  }

  participationPanel(MARGIN, 'Training Participation', false, data.trainingParticipation)
  participationPanel(MARGIN + panelW + 0.2, 'Subscription Coverage', true, data.subscriptionParticipation)

  addFooter(slide, 2, periodLabel)
  return slide
}

function buildSlide3(pptx: PptxGen, data: GroupAnalytics, periodLabel: string) {
  const slide = pptx.addSlide()
  addHeader(slide, 'Where the Investment Goes', `Spend split and monthly formal training trend, ${periodLabel}`)

  const leftW = 3.6
  slide.addShape('roundRect', { x: MARGIN, y: CONTENT_TOP, w: leftW, h: FOOTER_Y - 0.25 - CONTENT_TOP, rectRadius: 0.06, fill: { color: C.panelBg }, line: { color: C.navyLight, width: 0.75 } })
  slide.addText('Investment Split', { x: MARGIN + 0.2, y: CONTENT_TOP + 0.15, w: leftW - 0.4, h: 0.3, fontFace: 'Calibri', fontSize: 13, bold: true, color: C.navy })
  slide.addChart(pptx.ChartType.doughnut, [{
    name: 'Investment Split',
    labels: ['Formal Training', 'Strategic Learnings', 'Subscriptions'],
    values: [data.totalTrainingCost, data.totalOtherTrainingCost, data.totalSubscriptionCost],
  }], {
    x: MARGIN + 0.2, y: CONTENT_TOP + 0.5, w: leftW - 0.4, h: 2.6,
    chartColors: [C.navy, C.gold, C.green],
    showLegend: false, dataLabelFontSize: 10, dataLabelColor: 'FFFFFF', showValue: false, showPercent: true, dataLabelPosition: 'ctr',
  })
  const legendY = CONTENT_TOP + 3.3
  slide.addText([
    { text: `${fmt(data.totalTrainingCost)}  `, options: { bold: true, color: C.navy } },
    { text: `Formal Training (${pct(data.trainingSharePct)})\n`, options: { color: C.gray } },
    { text: `${fmt(data.totalOtherTrainingCost)}  `, options: { bold: true, color: C.gold } },
    { text: `Strategic Learnings (${pct(data.otherSharePct)})\n`, options: { color: C.gray } },
    { text: `${fmt(data.totalSubscriptionCost)}  `, options: { bold: true, color: C.green } },
    { text: `Subscriptions (${pct(data.subscriptionSharePct)})`, options: { color: C.gray } },
  ], { x: MARGIN + 0.2, y: legendY, w: leftW - 0.4, h: 1.0, fontFace: 'Calibri', fontSize: 9, lineSpacing: 16 })

  const rightX = MARGIN + leftW + 0.25
  const rightW = PAGE_W - MARGIN - rightX
  slide.addShape('roundRect', { x: rightX, y: CONTENT_TOP, w: rightW, h: FOOTER_Y - 0.25 - CONTENT_TOP, rectRadius: 0.06, fill: { color: C.panelBg }, line: { color: C.navyLight, width: 0.75 } })
  slide.addText('Monthly Formal Training Spend (₦)', { x: rightX + 0.2, y: CONTENT_TOP + 0.15, w: rightW - 0.4, h: 0.3, fontFace: 'Calibri', fontSize: 13, bold: true, color: C.navy })
  if (data.monthlySpend.length > 0) {
    slide.addChart(pptx.ChartType.line, [{
      name: 'Formal Training Spend',
      labels: data.monthlySpend.map((m) => m.month),
      values: data.monthlySpend.map((m) => m.cost),
    }], {
      x: rightX + 0.2, y: CONTENT_TOP + 0.5, w: rightW - 0.4, h: FOOTER_Y - 0.55 - CONTENT_TOP,
      chartColors: [C.navy], lineSize: 2.5, lineDataSymbol: 'circle', lineDataSymbolSize: 5,
      catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, showLegend: false,
    })
  }

  addFooter(slide, 3, periodLabel)
  return slide
}

function buildSlide4(pptx: PptxGen, data: GroupAnalytics, periodLabel: string) {
  const slide = pptx.addSlide()
  addHeader(slide, 'Investment & Coverage by Business Unit', 'Total learning spend (₦) and % of staff trained, per entity')

  const panelW = (PAGE_W - MARGIN * 2 - 0.2) / 2
  const panelTop = CONTENT_TOP
  const panelH = FOOTER_Y - 0.25 - panelTop
  const bus = data.businessUnits // already sorted by totalInvestment desc
  const busByCoverage = [...data.businessUnits].sort((a, b) => b.coverageRatio - a.coverageRatio)

  slide.addShape('roundRect', { x: MARGIN, y: panelTop, w: panelW, h: panelH, rectRadius: 0.06, fill: { color: C.panelBg }, line: { color: C.navyLight, width: 0.75 } })
  slide.addText('Total Investment by Business Unit (₦M)', { x: MARGIN + 0.2, y: panelTop + 0.15, w: panelW - 0.4, h: 0.3, fontFace: 'Calibri', fontSize: 12, bold: true, color: C.navy })
  slide.addChart(pptx.ChartType.bar, [{
    name: 'Total Investment (₦M)',
    labels: bus.map((b) => b.name),
    values: bus.map((b) => Math.round((b.totalInvestment / 1_000_000) * 100) / 100),
  }], {
    x: MARGIN + 0.2, y: panelTop + 0.5, w: panelW - 0.4, h: panelH - 0.7,
    barDir: 'bar', chartColors: [C.navy], showLegend: false, catAxisLabelFontSize: 8, valAxisLabelFontSize: 8,
    dataLabelPosition: 'outEnd', showValue: true, dataLabelFontSize: 8, dataLabelColor: C.navy,
  })

  const rightX = MARGIN + panelW + 0.2
  slide.addShape('roundRect', { x: rightX, y: panelTop, w: panelW, h: panelH, rectRadius: 0.06, fill: { color: C.panelBg }, line: { color: C.navyLight, width: 0.75 } })
  slide.addText('Staff Coverage by Business Unit (%)', { x: rightX + 0.2, y: panelTop + 0.15, w: panelW - 0.4, h: 0.3, fontFace: 'Calibri', fontSize: 12, bold: true, color: C.navy })
  slide.addChart(pptx.ChartType.bar, [{
    name: 'Coverage %',
    labels: busByCoverage.map((b) => b.name),
    values: busByCoverage.map((b) => Math.round(b.coverageRatio * 10) / 10),
  }], {
    x: rightX + 0.2, y: panelTop + 0.5, w: panelW - 0.4, h: panelH - 0.7,
    barDir: 'bar', chartColors: [C.green], showLegend: false, catAxisLabelFontSize: 8, valAxisLabelFontSize: 8,
    valAxisMinVal: 0, valAxisMaxVal: 100,
    dataLabelPosition: 'outEnd', showValue: true, dataLabelFontSize: 8, dataLabelColor: C.green,
  })

  addFooter(slide, 4, periodLabel)
  return slide
}

function buildBUProfileSlide(pptx: PptxGen, title: string, subtitle: string, bus: GroupAnalytics['businessUnits'], pageNumber: number, periodLabel: string, icons: IconImages) {
  const slide = pptx.addSlide()
  addHeader(slide, title, subtitle)

  const cols = 2
  const gap = 0.2
  const cardW = (PAGE_W - MARGIN * 2 - gap) / cols
  const cardH = (FOOTER_Y - 0.25 - CONTENT_TOP - gap) / 2

  bus.forEach((bu, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = MARGIN + col * (cardW + gap)
    const y = CONTENT_TOP + row * (cardH + gap)

    slide.addShape('roundRect', { x, y, w: cardW, h: cardH, rectRadius: 0.06, fill: { color: C.white }, line: { color: C.navyLight, width: 0.75 } })
    const buildingImg = icons.building2
    if (buildingImg) {
      slide.addImage({ data: buildingImg, x: x + 0.18, y: y + 0.18, w: 0.35, h: 0.35 })
    } else {
      slide.addShape('roundRect', { x: x + 0.18, y: y + 0.18, w: 0.35, h: 0.35, rectRadius: 0.05, fill: { color: C.navyLight }, line: { type: 'none' } })
    }
    slide.addText(bu.name, { x: x + 0.65, y: y + 0.14, w: cardW - 2.1, h: 0.4, fontFace: 'Calibri', fontSize: 16, bold: true, color: C.navyDark, valign: 'middle' })
    slide.addText([
      { text: 'Total Learning Investment\n', options: { fontSize: 11, color: C.gray } },
      { text: fmt(bu.totalInvestment), options: { fontSize: 24, bold: true, color: C.navy, breakLine: true } },
    ], { x: x + cardW - 1.7, y: y + 0.1, w: 1.55, h: 0.6, align: 'right', fontFace: 'Calibri' })

    const colW = cardW / 3
    slide.addText([{ text: 'Formal Training\n', options: { fontSize: 11, color: C.gray, breakLine: true } }, { text: fmt(bu.trainingCost), options: { fontSize: 16, bold: true, color: C.navyDark } }], { x: x + 0.2, y: y + 0.65, w: colW - 0.2, h: 0.55, fontFace: 'Calibri' })
    slide.addText([{ text: 'Strategic Learnings\n', options: { fontSize: 11, color: C.gray, breakLine: true } }, { text: fmt(bu.otherInvestmentCost), options: { fontSize: 16, bold: true, color: C.gold } }], { x: x + colW, y: y + 0.65, w: colW - 0.2, h: 0.55, fontFace: 'Calibri' })
    slide.addText([{ text: 'Subscription Spend\n', options: { fontSize: 11, color: C.gray, breakLine: true } }, { text: fmt(bu.subscriptionCost), options: { fontSize: 16, bold: true, color: C.navyDark } }], { x: x + colW * 2, y: y + 0.65, w: colW - 0.2, h: 0.55, fontFace: 'Calibri' })
    slide.addText(
      bu.budget > 0 ? `${pct((bu.trainingCost / bu.budget) * 100)} of budget` : 'Budget not set',
      { x: x + 0.2, y: y + 1.25, w: colW - 0.2, h: 0.28, fontFace: 'Calibri', fontSize: 10, color: C.gray }
    )
    slide.addText(
      `${bu.otherStaffTrained} staff`,
      { x: x + colW, y: y + 1.25, w: colW - 0.2, h: 0.28, fontFace: 'Calibri', fontSize: 10, color: C.gray }
    )
    slide.addText(
      `${bu.subscriptionStaff} members`,
      { x: x + colW * 2, y: y + 1.25, w: colW - 0.2, h: 0.28, fontFace: 'Calibri', fontSize: 10, color: C.gray }
    )

    const statsY = y + 1.6
    slide.addShape('line', { x: x + 0.2, y: statsY, w: cardW - 0.4, h: 0, line: { color: C.navyLight, width: 0.5 } })
    slide.addText('Coverage', { x: x + 0.2, y: statsY + 0.08, w: cardW / 2 - 0.3, h: 0.22, fontFace: 'Calibri', fontSize: 12, color: C.gray })
    slide.addText(bu.totalStaff > 0 ? pct(bu.coverageRatio) : '—', { x: x + 0.2, y: statsY + 0.3, w: cardW / 2 - 0.3, h: 0.32, fontFace: 'Calibri', fontSize: 24, bold: true, color: C.gold })
    slide.addText(`${bu.staffTrained} trained (1+ training)`, { x: x + 0.2, y: statsY + 0.66, w: cardW / 2 - 0.3, h: 0.22, fontFace: 'Calibri', fontSize: 11, color: C.gray })
    slide.addText('Impact', { x: x + cardW / 2, y: statsY + 0.08, w: cardW / 2 - 0.3, h: 0.22, fontFace: 'Calibri', fontSize: 12, color: C.gray })
    slide.addText(rating(bu.avgImpactScore), { x: x + cardW / 2, y: statsY + 0.3, w: cardW / 2 - 0.3, h: 0.32, fontFace: 'Calibri', fontSize: 24, bold: true, color: C.green })
    slide.addText(
      `confidence${bu.postTrainingImpactScore > 0 ? ` · Mgr ${rating(bu.postTrainingImpactScore)}` : ''}`,
      { x: x + cardW / 2, y: statsY + 0.66, w: cardW / 2 - 0.3, h: 0.22, fontFace: 'Calibri', fontSize: 11, color: C.gray }
    )
  })

  addFooter(slide, pageNumber, periodLabel)
  return slide
}

function buildSlide7(pptx: PptxGen, data: GroupAnalytics, periodLabel: string) {
  const slide = pptx.addSlide()
  addHeader(slide, 'Differentiating Capabilities Coverage', 'Share of total staff trained against each strategic capability')
  const coverage = data.capabilityCoverage

  if (coverage.length === 0) {
    slide.addText('No Differentiating Capabilities configured yet — add them in Admin.', {
      x: MARGIN, y: CONTENT_TOP + 1.5, w: PAGE_W - MARGIN * 2, h: 0.5, align: 'center', fontFace: 'Calibri', fontSize: 12, color: C.gray,
    })
  } else {
    const top = CONTENT_TOP, h = FOOTER_Y - 0.25 - top
    slide.addShape('roundRect', { x: MARGIN, y: top, w: PAGE_W - MARGIN * 2, h, rectRadius: 0.06, fill: { color: C.panelBg }, line: { color: C.navyLight, width: 0.75 } })
    slide.addChart(pptx.ChartType.bar, [{
      name: 'Coverage %',
      labels: coverage.map((c) => c.capability),
      values: coverage.map((c) => Math.round(c.coverageRatio * 10) / 10),
    }], {
      x: MARGIN + 0.3, y: top + 0.3, w: PAGE_W - MARGIN * 2 - 0.6, h: h - 0.6,
      barDir: 'bar', chartColors: [C.navy], showLegend: false, catAxisLabelFontSize: 10, valAxisLabelFontSize: 9,
      valAxisMinVal: 0, valAxisMaxVal: 100,
      dataLabelPosition: 'outEnd', showValue: true, dataLabelFontSize: 9, dataLabelColor: C.navy,
    })
  }

  addFooter(slide, 7, periodLabel)
  return slide
}

function buildSlide8(pptx: PptxGen, data: GroupAnalytics, periodLabel: string, icons: IconImages) {
  const slide = pptx.addSlide()
  addHeader(slide, 'Talent Member (TM) Trainings', 'Coverage and investment for the Talent Member population')
  const tm = data.talentMember
  const trainedPct = tm.totalHeadcount > 0 ? (tm.staffTrained / tm.totalHeadcount) * 100 : 0
  const notTrainedPct = tm.totalHeadcount > 0 ? (tm.staffNotTrained / tm.totalHeadcount) * 100 : 0

  const tiles: Tile[] = [
    { iconKey: 'users', title: 'Total Talent Members', value: tm.totalHeadcount.toLocaleString(), subtitle: 'Current TM roster' },
    { iconKey: 'userCheck', title: 'Staff Trained', value: tm.staffTrained.toLocaleString(), subtitle: tm.totalHeadcount > 0 ? `${pct(trainedPct)} of TM population` : 'No Talent Members on roster', valueColor: C.green },
    { iconKey: 'userX', title: 'Yet to be Trained', value: tm.staffNotTrained.toLocaleString(), subtitle: tm.totalHeadcount > 0 ? `${pct(notTrainedPct)} of TM population` : 'No Talent Members on roster', valueColor: tm.staffNotTrained > 0 ? C.red : C.green },
    { iconKey: 'userMinus', title: 'Staff Exempted', value: tm.staffExempted.toLocaleString(), subtitle: "Excused from this year's requirement" },
    { iconKey: 'nairaSign', title: 'Total Spend', value: fmt(tm.totalSpend), subtitle: 'Counts toward Formal Training Spend', valueColor: C.gold },
    { iconKey: 'gauge', title: 'TM Coverage', value: pct(tm.coveragePct), subtitle: 'Trained ÷ (Total − Exempted)', valueColor: tm.coveragePct >= 70 ? C.green : tm.coveragePct >= 40 ? C.gold : C.red },
  ]
  addTileGrid(slide, tiles, icons, 3)

  addFooter(slide, 8, periodLabel)
  return slide
}

const SLIDE_BUILDERS = [
  (pptx: PptxGen, data: GroupAnalytics, periodLabel: string, icons: IconImages) => buildSlide1(pptx, data, periodLabel, icons),
  (pptx: PptxGen, data: GroupAnalytics, periodLabel: string, icons: IconImages) => buildSlide2(pptx, data, periodLabel, icons),
  (pptx: PptxGen, data: GroupAnalytics, periodLabel: string) => buildSlide3(pptx, data, periodLabel),
  (pptx: PptxGen, data: GroupAnalytics, periodLabel: string) => buildSlide4(pptx, data, periodLabel),
  (pptx: PptxGen, data: GroupAnalytics, periodLabel: string, icons: IconImages) => buildBUProfileSlide(pptx, 'Business Unit Profiles', 'Top performing entities by total investment', data.businessUnits.slice(0, 4), 5, periodLabel, icons),
  (pptx: PptxGen, data: GroupAnalytics, periodLabel: string, icons: IconImages) => buildBUProfileSlide(pptx, 'Business Unit Profiles', 'Remaining entities across the group', data.businessUnits.slice(4, 8), 6, periodLabel, icons),
  (pptx: PptxGen, data: GroupAnalytics, periodLabel: string) => buildSlide7(pptx, data, periodLabel),
  (pptx: PptxGen, data: GroupAnalytics, periodLabel: string, icons: IconImages) => buildSlide8(pptx, data, periodLabel, icons),
]

export async function newPresentation() {
  const mod = await import('pptxgenjs')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PptxGenJS = ((mod as any).default ?? mod) as new () => PptxGen
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'LD_REPORT_16x9', width: PAGE_W, height: PAGE_H })
  pptx.layout = 'LD_REPORT_16x9'
  return pptx
}

/** Build the full report presentation and return it (not yet saved). */
export async function buildReportPptx(data: GroupAnalytics, periodLabel: string) {
  const [pptx, icons] = await Promise.all([newPresentation(), rasterizeIconBadges(REPORT_ICON_SPECS)])
  SLIDE_BUILDERS.forEach((build) => build(pptx, data, periodLabel, icons))
  return pptx
}

/** Build and download the full report deck. */
export async function exportFullDeckPptx(data: GroupAnalytics, periodLabel: string, filename = 'LD_Investment_Report') {
  const pptx = await buildReportPptx(data, periodLabel)
  await pptx.writeFile({ fileName: `${filename}.pptx` })
}

/** Build the full report deck server-side and return it as a Buffer (for email attachments). */
export async function buildReportPptxBuffer(data: GroupAnalytics, periodLabel: string): Promise<Buffer> {
  const pptx = await buildReportPptx(data, periodLabel)
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
}

/** Build and download a single slide (1-indexed) as its own one-slide .pptx. */
export async function exportSingleSlidePptx(data: GroupAnalytics, periodLabel: string, slideNumber: number, filename?: string) {
  const build = SLIDE_BUILDERS[slideNumber - 1]
  if (!build) throw new Error(`Invalid slide number: ${slideNumber}`)
  const [pptx, icons] = await Promise.all([newPresentation(), rasterizeIconBadges(REPORT_ICON_SPECS)])
  build(pptx, data, periodLabel, icons)
  await pptx.writeFile({ fileName: `${filename ?? `LD_Report_Slide${slideNumber}`}.pptx` })
}
