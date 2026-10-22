import { exportExcel, type ExportSheet } from './export'

interface Answers { answers: Record<string, string | string[]>; developmentNeeds: Record<string, string | string[]>[] }
interface ExportQuestion { id: string; label: string }
interface ExportSection { key: string; title: string; questions: ExportQuestion[] }

interface PDPManagerValidationRow { managerName: string | null; respondedAt: string | null; answers: string | null }
interface PDPStaffSurveyRow {
  staffId: string; staffName: string; businessUnit: string
  respondedAt: string | null; answers: string | null
  validations: PDPManagerValidationRow[]
}
interface PDPTeamMemberRow {
  staffId: string; staffName: string; businessUnit: string | null; status: string
  submittedAt: string | null; answers: string | null
}
interface PDPManagerSurveyRow { managerName: string; teamMembers: PDPTeamMemberRow[] }

function parseAnswers(raw: string | null): Answers | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Answers>
    return { answers: parsed.answers || {}, developmentNeeds: parsed.developmentNeeds || [] }
  } catch {
    return null
  }
}

function cell(v: string | string[] | undefined): string {
  if (v == null) return ''
  return Array.isArray(v) ? v.join('; ') : v
}

// Flattens one person's answers (from one source — self, a manager validation, or Track B) into
// a single row of { "<Section Title> — <Question Label>": value } columns, same shape every row
// since every row is built from the same cycle's sections — this is what makes a wide, scannable
// "detailed analysis" sheet possible without hardcoding any particular cycle's question set.
function flattenAnswersToRow(sections: ExportSection[], answers: Answers | null): Record<string, string> {
  const row: Record<string, string> = {}
  if (!answers) return row
  for (const section of sections) {
    if (section.key === 'development_needs') {
      answers.developmentNeeds.forEach((need, i) => {
        for (const q of section.questions) row[`Need ${i + 1} — ${q.label}`] = cell(need[q.id])
      })
    } else {
      for (const q of section.questions) row[`${section.title} — ${q.label}`] = cell(answers.answers[q.id])
    }
  }
  return row
}

// Merges Track A (self + each independent manager validation) and Track B (a manager filling
// directly, possibly under more than one of that person's managers via a PDPManagerOverride) by
// staffId — kept side by side as separate rows (one per source), never auto-resolved, same
// convention as the rest of this app's multi-source data handling. A DIFFERS column per question
// flags where sources disagree, rather than silently picking one.
export async function exportPDPCycleExcel(
  cycleTitle: string,
  sections: ExportSection[],
  staffSurveys: PDPStaffSurveyRow[],
  managerSurveys: PDPManagerSurveyRow[]
) {
  interface SourceRow { staffId: string; staffName: string; businessUnit: string; source: string; answers: Answers | null }
  const sourceRows: SourceRow[] = []

  for (const s of staffSurveys) {
    sourceRows.push({ staffId: s.staffId, staffName: s.staffName, businessUnit: s.businessUnit, source: 'Self', answers: parseAnswers(s.answers) })
    for (const v of s.validations) {
      sourceRows.push({ staffId: s.staffId, staffName: s.staffName, businessUnit: s.businessUnit, source: `Manager Validation (${v.managerName || 'Manager'})`, answers: parseAnswers(v.answers) })
    }
  }
  for (const m of managerSurveys) {
    for (const t of m.teamMembers) {
      if (t.status !== 'accepted' && t.status !== 'added' || !t.answers) continue
      sourceRows.push({ staffId: t.staffId, staffName: t.staffName, businessUnit: t.businessUnit || '', source: `Track B (${m.managerName})`, answers: parseAnswers(t.answers) })
    }
  }

  const allColumns = new Set<string>()
  const flattenedBySourceRow = sourceRows.map((r) => {
    const flat = flattenAnswersToRow(sections, r.answers)
    for (const col of Object.keys(flat)) allColumns.add(col)
    return { ...r, flat }
  })
  const columns = [...allColumns]

  // Per (staffId, column), which sources disagree — used for the DIFFERS summary count and to
  // mark individual detail rows, without ever picking a "winning" value.
  const valuesByStaffColumn = new Map<string, Set<string>>()
  for (const r of flattenedBySourceRow) {
    for (const col of columns) {
      const v = r.flat[col]
      if (!v) continue
      const key = `${r.staffId}::${col}`
      const set = valuesByStaffColumn.get(key) ?? new Set<string>()
      set.add(v)
      valuesByStaffColumn.set(key, set)
    }
  }
  let differCount = 0
  for (const set of valuesByStaffColumn.values()) if (set.size > 1) differCount++

  const detailRows: Record<string, unknown>[] = flattenedBySourceRow
    .sort((a, b) => a.staffName.localeCompare(b.staffName) || a.source.localeCompare(b.source))
    .map((r) => {
      const row: Record<string, unknown> = { 'Staff ID': r.staffId, Name: r.staffName, 'Business Unit': r.businessUnit, Source: r.source }
      let rowDiffers = false
      for (const col of columns) {
        row[col] = r.flat[col] || ''
        const set = valuesByStaffColumn.get(`${r.staffId}::${col}`)
        if (set && set.size > 1) rowDiffers = true
      }
      row['Flag'] = rowDiffers ? 'DIFFERS (see other sources for this person)' : ''
      return row
    })

  const byBU = new Map<string, Record<string, unknown>[]>()
  for (const r of detailRows) {
    const bu = String(r['Business Unit'] || 'Unassigned')
    if (!byBU.has(bu)) byBU.set(bu, [])
    byBU.get(bu)!.push(r)
  }

  const summaryRows: Record<string, unknown>[] = [
    { Metric: 'People with a submitted self plan (Track A)', Value: staffSurveys.filter((s) => s.respondedAt).length },
    { Metric: 'People with no self plan submitted yet', Value: staffSurveys.filter((s) => !s.respondedAt).length },
    { Metric: 'Manager validations completed', Value: staffSurveys.reduce((sum, s) => sum + s.validations.filter((v) => v.respondedAt).length, 0) },
    { Metric: 'Manager validations outstanding', Value: staffSurveys.reduce((sum, s) => sum + s.validations.filter((v) => !v.respondedAt).length, 0) },
    { Metric: 'Team members completed via Track B (manager-filled)', Value: managerSurveys.reduce((sum, m) => sum + m.teamMembers.filter((t) => t.submittedAt).length, 0) },
    { Metric: 'Person/question combinations where sources disagree (DIFFERS)', Value: differCount },
  ]

  const sheets: ExportSheet[] = [
    { name: 'Summary', rows: summaryRows },
    { name: 'All', rows: detailRows },
    ...[...byBU.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bu, rows]) => ({ name: bu, rows })),
  ]
  await exportExcel(sheets, cycleTitle.replace(/[^a-z0-9]+/gi, '_'))
}
