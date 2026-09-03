// Exports the analyzed Insights view (not the raw per-question answers — see the "Download CSV"
// button for that) as a multi-sheet workbook: one "Summary" sheet with the headline KPIs and the
// Per-Tool Competency & Need table, then one sheet per tool reproducing everything in that tool's
// on-screen deep-dive (skill gaps, level rosters, Needs Help roster, BU/Department breakdown) —
// so an L&D team can work from the exact same numbers offline without re-deriving them.

interface Person {
  name: string
  businessUnit: string | null
  department: string | null
}

interface ToolInsight {
  section: string
  applicable: number
  skipped: number
  totalSkills: number
  levelCounts: { advanced: number; intermediate: number; basic: number; novice: number }
  levelPeople: {
    advanced: (Person & { canDo: string[] })[]
    intermediate: (Person & { canDo: string[] })[]
    basic: (Person & { canDo: string[] })[]
    novice: (Person & { canDo: string[] })[]
  }
  needsHelp: (Person & { missing: string[] })[]
  needsHelpByBU: { name: string; count: number }[]
  needsHelpByDepartment: { name: string; count: number }[]
  skillGaps: { skill: string; count: number }[]
  priorityScore: number | null
  priorityVotes: number
}

interface InsightsForExport {
  toolInsights: ToolInsight[]
  priorityRanking: { item: string; score: number; votes: number }[]
  summary: {
    totalRespondents: number
    totalNeedingHelp: number
    topGapTool: ToolInsight | null
    topSkillGap: { skill: string; count: number; tool: string } | null
    topPriorityTool: { item: string; score: number; votes: number } | null
  }
}

async function getXLSX() {
  const mod = await import('xlsx')
  return mod.default ?? mod
}

type Row = (string | number)[]

function personRow(p: Person, extra: Row): Row {
  return [p.name, p.businessUnit || '', p.department || '', ...extra]
}

// Excel sheet names: max 31 chars, no []:*?/\, and must be unique in the workbook — tool section
// names can collide once truncated (e.g. two long names sharing the same 31-char prefix), so a
// numeric suffix is appended on collision.
function sheetName(raw: string, taken: Set<string>): string {
  const base = raw.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Tool'
  let name = base
  let n = 2
  while (taken.has(name)) {
    const suffix = ` (${n})`
    name = base.slice(0, 31 - suffix.length) + suffix
    n++
  }
  taken.add(name)
  return name
}

export async function exportSurveyInsightsExcel(surveyTitle: string, insights: InsightsForExport) {
  const XLSX = await getXLSX()
  const wb = XLSX.utils.book_new()
  const today = new Date().toISOString().slice(0, 10)

  // ── Summary sheet ──
  const summary: Row[] = [
    [`${surveyTitle} — Insights Summary`],
    [`Generated ${today}`],
    [],
    ['Total Respondents', insights.summary.totalRespondents],
    ['People Needing Help in ≥1 Tool', insights.summary.totalNeedingHelp],
    ['Biggest Skills Gap Tool', insights.summary.topGapTool?.section || '', `${insights.summary.topGapTool?.needsHelp.length || 0} people`],
    ['Most-Wanted Single Skill', insights.summary.topSkillGap?.skill || '', `${insights.summary.topSkillGap?.count || 0} people`, insights.summary.topSkillGap?.tool || ''],
    ['#1 Staff-Ranked Training Priority', insights.summary.topPriorityTool?.item || ''],
    [],
    ["Level criteria: Advanced = can already do 70%+ of a tool's listed skills. Intermediate = 40-69%. Basic = under 40%. Novice = uses the tool but selected none."],
    [],
    ['Per-Tool Competency & Need'],
    ['Tool', 'Users', 'Advanced', 'Intermediate', 'Basic', 'Novice', 'Needs Help', 'Priority Score'],
    ...insights.toolInsights.map((t): Row => [
      t.section, t.applicable, t.levelCounts.advanced, t.levelCounts.intermediate, t.levelCounts.basic, t.levelCounts.novice,
      t.needsHelp.length, t.priorityScore ?? '',
    ]),
  ]
  if (insights.priorityRanking.length > 0) {
    summary.push(
      [],
      ['Training Priority Ranking (score out of 100 — see Summary sheet criteria note)'],
      ['Item', 'Score', 'Respondents Who Ranked It'],
      ...insights.priorityRanking.map((r): Row => [r.item, r.score, r.votes]),
    )
  }
  const summaryWs = XLSX.utils.aoa_to_sheet(summary)
  summaryWs['!cols'] = [{ wch: 42 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  // ── One sheet per tool ──
  const takenNames = new Set<string>(['Summary'])
  for (const t of insights.toolInsights) {
    const rows: Row[] = [
      [t.section],
      [`${t.applicable} applicable respondent${t.applicable === 1 ? '' : 's'}${t.skipped > 0 ? ` · ${t.skipped} skipped (rarely/never use this tool)` : ''}`],
      [],
      ['Level Breakdown'],
      ['Level', 'Count', 'Criteria'],
      ['Advanced', t.levelCounts.advanced, '≥70% of skills'],
      ['Intermediate', t.levelCounts.intermediate, '40-69% of skills'],
      ['Basic', t.levelCounts.basic, 'under 40% of skills'],
      ['Novice', t.levelCounts.novice, 'uses tool, selected no skills'],
      [],
    ]

    if (t.skillGaps.length > 0) {
      rows.push(
        ['Skill Gaps — most commonly missing (what to build training for)'],
        ['Skill', 'People Missing It'],
        ...t.skillGaps.map((g): Row => [g.skill, g.count]),
        [],
      )
    }

    rows.push(
      ['Needs Help — has a gap between what they can do and what they say would help'],
      ['Name', 'Business Unit', 'Department', 'Missing Skills'],
      ...(t.needsHelp.length > 0 ? t.needsHelp.map((p) => personRow(p, [p.missing.join('; ')])) : [['(nobody)', '', '', '']] as Row[]),
      [],
    )

    const levelSections: { label: string; people: (Person & { canDo: string[] })[] }[] = [
      { label: 'Advanced — could mentor/peer-coach others', people: t.levelPeople.advanced },
      { label: 'Intermediate', people: t.levelPeople.intermediate },
      { label: 'Basic', people: t.levelPeople.basic },
      { label: 'Novice — uses the tool but selected no skills', people: t.levelPeople.novice },
    ]
    for (const { label, people } of levelSections) {
      rows.push(
        [label],
        ['Name', 'Business Unit', 'Department', `Skills They Can Do (of ${t.totalSkills})`],
        ...(people.length > 0 ? people.map((p) => personRow(p, [p.canDo.join('; ')])) : [['(nobody)', '', '', '']] as Row[]),
        [],
      )
    }

    if (t.needsHelpByBU.length > 0) {
      rows.push(
        ['Needs Help — by Business Unit'],
        ['Business Unit', 'Count'],
        ...t.needsHelpByBU.map((b): Row => [b.name, b.count]),
        [],
      )
    }
    if (t.needsHelpByDepartment.length > 0) {
      rows.push(
        ['Needs Help — by Department'],
        ['Department', 'Count'],
        ...t.needsHelpByDepartment.map((d): Row => [d.name, d.count]),
      )
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 70 }]
    XLSX.utils.book_append_sheet(wb, ws, sheetName(t.section, takenNames))
  }

  XLSX.writeFile(wb, `${surveyTitle.replace(/\s+/g, '_')}_insights_${today}.xlsx`)
}
