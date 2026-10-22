import { exportExcel, type ExportSheet } from './export'

type Priority = 'high' | 'medium' | 'low' | 'not-needed'
interface CapabilityAnswer { priority: Priority; action: string }
interface CustomEntry { label: string; priority: Priority; action: string }
interface Answers { capabilities: Record<string, CapabilityAnswer>; customEntries: CustomEntry[] }

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
  try { return JSON.parse(raw) as Answers } catch { return null }
}

function priorityLabel(p: Priority | undefined): string {
  if (!p) return ''
  return { high: 'High', medium: 'Medium', low: 'Low', 'not-needed': 'Not needed' }[p]
}

// Merges Track A (self + each independent manager validation) and Track B (a manager filling
// directly, possibly under more than one of that person's managers via a PDPManagerOverride) by
// staffId/capability — kept side by side, never auto-resolved, same convention as the rest of
// this app's multi-source data handling. A DIFFERS flag marks a capability where the sources
// disagree on priority, rather than silently picking one.
export async function exportPDPCycleExcel(
  cycleTitle: string,
  staffSurveys: PDPStaffSurveyRow[],
  managerSurveys: PDPManagerSurveyRow[]
) {
  interface PersonRow {
    staffId: string; staffName: string; businessUnit: string
    selfAnswers: Answers | null
    managerValidationAnswers: { managerName: string; answers: Answers }[]
    trackBAnswers: { managerName: string; answers: Answers }[]
  }
  const byStaffId = new Map<string, PersonRow>()
  const getOrCreate = (staffId: string, staffName: string, businessUnit: string): PersonRow => {
    let row = byStaffId.get(staffId)
    if (!row) {
      row = { staffId, staffName, businessUnit, selfAnswers: null, managerValidationAnswers: [], trackBAnswers: [] }
      byStaffId.set(staffId, row)
    }
    return row
  }

  for (const s of staffSurveys) {
    const row = getOrCreate(s.staffId, s.staffName, s.businessUnit)
    row.selfAnswers = parseAnswers(s.answers)
    for (const v of s.validations) {
      const a = parseAnswers(v.answers)
      if (a) row.managerValidationAnswers.push({ managerName: v.managerName || 'Manager', answers: a })
    }
  }
  for (const m of managerSurveys) {
    for (const t of m.teamMembers) {
      if (t.status !== 'accepted' && t.status !== 'added') continue
      const a = parseAnswers(t.answers)
      if (!a) continue
      const row = getOrCreate(t.staffId, t.staffName, t.businessUnit || '')
      row.trackBAnswers.push({ managerName: m.managerName, answers: a })
    }
  }

  // Collect every capability name that appears anywhere, so a capability only Track B touched
  // (or vice versa) still gets its own row.
  const allCapabilityNames = new Set<string>()
  for (const row of byStaffId.values()) {
    for (const name of Object.keys(row.selfAnswers?.capabilities || {})) allCapabilityNames.add(name)
    for (const v of row.managerValidationAnswers) for (const name of Object.keys(v.answers.capabilities)) allCapabilityNames.add(name)
    for (const v of row.trackBAnswers) for (const name of Object.keys(v.answers.capabilities)) allCapabilityNames.add(name)
  }

  const detailRows: Record<string, unknown>[] = []
  let differCount = 0
  for (const row of [...byStaffId.values()].sort((a, b) => a.staffName.localeCompare(b.staffName))) {
    for (const capability of allCapabilityNames) {
      const self = row.selfAnswers?.capabilities[capability]
      const managerPriorities = row.managerValidationAnswers.map((v) => v.answers.capabilities[capability]?.priority).filter((p): p is Priority => !!p)
      const trackBPriorities = row.trackBAnswers.map((v) => v.answers.capabilities[capability]?.priority).filter((p): p is Priority => !!p)
      const allPriorities = [self?.priority, ...managerPriorities, ...trackBPriorities].filter((p): p is Priority => !!p)
      if (allPriorities.length === 0) continue // nobody touched this capability for this person
      const distinct = new Set(allPriorities)
      const differs = distinct.size > 1
      if (differs) differCount++

      detailRows.push({
        'Staff ID': row.staffId,
        Name: row.staffName,
        Capability: capability,
        'Self Priority': priorityLabel(self?.priority),
        'Self Action': self?.action || '',
        'Manager Validation Priority': row.managerValidationAnswers.map((v) => `${priorityLabel(v.answers.capabilities[capability]?.priority)} (${v.managerName})`).filter((s) => !s.startsWith('(')).join('; '),
        'Track B (Manager-Filled) Priority': row.trackBAnswers.map((v) => `${priorityLabel(v.answers.capabilities[capability]?.priority)} (${v.managerName})`).filter((s) => !s.startsWith('(')).join('; '),
        'Track B Action': row.trackBAnswers.map((v) => v.answers.capabilities[capability]?.action).filter(Boolean).join('; '),
        Flag: differs ? 'DIFFERS' : '',
      })
    }
    // Custom (not-in-the-list) entries, kept as their own rows per source.
    const customSources: { source: string; entries: CustomEntry[] }[] = [
      { source: 'Self', entries: row.selfAnswers?.customEntries || [] },
      ...row.managerValidationAnswers.map((v) => ({ source: `Manager Validation (${v.managerName})`, entries: v.answers.customEntries })),
      ...row.trackBAnswers.map((v) => ({ source: `Track B (${v.managerName})`, entries: v.answers.customEntries })),
    ]
    for (const { source, entries } of customSources) {
      for (const e of entries) {
        detailRows.push({
          'Staff ID': row.staffId, Name: row.staffName, Capability: `${e.label} (added by ${source})`,
          'Self Priority': '', 'Self Action': '', 'Manager Validation Priority': '', 'Track B (Manager-Filled) Priority': priorityLabel(e.priority),
          'Track B Action': e.action, Flag: '',
        })
      }
    }
  }

  const byBU = new Map<string, Record<string, unknown>[]>()
  for (const r of detailRows) {
    const bu = String((byStaffId.get(r['Staff ID'] as string) || {}).businessUnit || 'Unassigned')
    if (!byBU.has(bu)) byBU.set(bu, [])
    byBU.get(bu)!.push(r)
  }

  const summaryRows: Record<string, unknown>[] = [
    { Metric: 'People with a submitted self plan (Track A)', Value: staffSurveys.filter((s) => s.respondedAt).length },
    { Metric: 'People with no self plan submitted yet', Value: staffSurveys.filter((s) => !s.respondedAt).length },
    { Metric: 'Manager validations completed', Value: staffSurveys.reduce((sum, s) => sum + s.validations.filter((v) => v.respondedAt).length, 0) },
    { Metric: 'Manager validations outstanding', Value: staffSurveys.reduce((sum, s) => sum + s.validations.filter((v) => !v.respondedAt).length, 0) },
    { Metric: 'Team members completed via Track B (manager-filled)', Value: managerSurveys.reduce((sum, m) => sum + m.teamMembers.filter((t) => t.submittedAt).length, 0) },
    { Metric: 'Capability/person rows where sources disagree (DIFFERS)', Value: differCount },
  ]

  const sheets: ExportSheet[] = [
    { name: 'Summary', rows: summaryRows },
    { name: 'All', rows: detailRows },
    ...[...byBU.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([bu, rows]) => ({ name: bu, rows })),
  ]
  await exportExcel(sheets, cycleTitle.replace(/[^a-z0-9]+/gi, '_'))
}
