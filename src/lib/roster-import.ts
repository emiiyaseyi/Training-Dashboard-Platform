import { prisma } from '@/lib/prisma'
import { connectToSpreadsheet, fetchSheetAsBuffer } from '@/lib/google-sheets'
import { parseRosterExcel } from '@/lib/excel-parser'
import type { RosterRow } from '@/lib/excel-parser'
import { importRosterRows } from '@/lib/import-records'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'

// One-off (and re-runnable) import of the staff list from a Google Sheet tab into Postgres.
// Unlike the old daily sync, this never adds a snapshot row for someone who already exists — their
// current record is updated in place — and it only runs when an admin clicks it, so nothing can
// overwrite an edit made in the app behind their back. A blank cell in the sheet never wipes a
// value the app already has; a line manager that isn't a real Staff ID in the same sheet is
// reported and NOT imported.

export interface RosterImportIssue { staffId: string; name: string; problem: string }

export interface RosterImportPlan {
  sheetName: string
  totalRows: number
  newStaff: number
  changedStaff: number
  unchangedStaff: number
  skippedStaff: number
  notInSheet: { staffId: string; name: string }[]
  issues: RosterImportIssue[]
  sampleChanges: { staffId: string; name: string; changes: string[] }[]
  error?: string
}

// Staff ID key for matching: punctuation/case ignored AND the number padded to 4 digits, so a sheet
// that says MSBL-0110 matches a stored MSBL-110 (the same person) instead of becoming a duplicate.
function normKey(id: string | null | undefined): string {
  const k = normalizeStaffIdKey(id)
  const m = k.match(/^([A-Z]+)(\d+)$/)
  return m ? m[1] + m[2].padStart(4, '0') : k
}

type Existing = Awaited<ReturnType<typeof prisma.staffRosterRecord.findMany>>[number]

const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name', middleName: 'Middle name', lastName: 'Last name', email: 'Email',
  lineManagerStaffId: 'Line manager ID', businessUnit: 'Business unit', role: 'Role', department: 'Department',
  employmentDate: 'Employment date', confirmed: 'Confirmed', active: 'Active',
}

function fullName(r: { firstName: string; lastName: string }) { return `${r.firstName} ${r.lastName}`.trim() }
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')

async function readSheetRows(tabOverride?: string): Promise<{ sheetName: string; rows: RosterRow[]; error?: string }> {
  const config = await prisma.googleSheetsConfig.findFirst()
  const sheetName = (tabOverride || config?.rosterSheetName || config?.comprehensiveStaffListSheetName || '').trim()
  if (!config?.spreadsheetUrl) return { sheetName, rows: [], error: 'No Google Sheet configured under Admin -> Live Data Source.' }
  if (!sheetName) return { sheetName, rows: [], error: 'Enter the name of the tab that holds the staff list.' }
  try {
    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    if (!connection.tabTitles.includes(sheetName)) return { sheetName, rows: [], error: `Tab "${sheetName}" not found in the spreadsheet.` }
    const buffer = await fetchSheetAsBuffer(connection.spreadsheetId, sheetName, connection.accessToken)
    const { rows, errors } = parseRosterExcel(buffer)
    if (errors.length) return { sheetName, rows: [], error: errors.join(' ') }
    return { sheetName, rows }
  } catch (err) {
    return { sheetName, rows: [], error: err instanceof Error ? err.message : 'Failed to read the sheet.' }
  }
}

function diff(row: RosterRow, cur: Existing, managerOk: boolean): { data: Record<string, unknown>; changes: string[] } {
  const data: Record<string, unknown> = {}
  const changes: string[] = []
  const set = (field: string, next: unknown, prev: unknown, show: (v: unknown) => string = (v) => String(v ?? '')) => {
    if (next === prev) return
    data[field] = next
    changes.push(`${FIELD_LABELS[field]}: ${show(prev) || '—'} → ${show(next) || '—'}`)
  }
  set('firstName', row.firstName.trim() || cur.firstName, cur.firstName)
  set('lastName', row.lastName.trim() || cur.lastName, cur.lastName)
  if (row.middleName.trim() && row.middleName.trim() !== (cur.middleName || '')) set('middleName', row.middleName.trim(), cur.middleName)
  if (row.email.trim() && row.email.trim().toLowerCase() !== (cur.email || '').toLowerCase()) set('email', row.email.trim().toLowerCase(), cur.email)
  if (managerOk && row.lineManagerStaffId.trim()) {
    const next = row.lineManagerStaffId.trim().toUpperCase()
    if (next !== (cur.lineManagerStaffId || '').toUpperCase()) set('lineManagerStaffId', next, cur.lineManagerStaffId)
  }
  const bu = row.businessUnit.trim() ? normalizeBUName(row.businessUnit.trim()) : ''
  if (bu && bu !== cur.businessUnit) set('businessUnit', bu, cur.businessUnit)
  if (row.role.trim() && row.role.trim() !== (cur.role || '')) set('role', row.role.trim(), cur.role)
  if (row.department.trim() && row.department.trim() !== (cur.department || '')) set('department', row.department.trim(), cur.department)
  if (row.employmentDate && row.employmentDate.slice(0, 10) !== iso(cur.employmentDate)) {
    set('employmentDate', new Date(row.employmentDate), cur.employmentDate, (v) => (v instanceof Date ? iso(v) : String(v ?? '')))
  }
  const TEXT_FIELDS = [
    ['employmentType', 'Type of employment'], ['payGroup', 'Pay group'], ['staffCategory', 'Staff category'], ['location', 'Location'],
    ['maritalStatus', 'Marital status'], ['stateOfOrigin', 'State of origin'], ['geoPoliticalZone', 'Geo-political zone'],
    ['religion', 'Religion'], ['sex', 'Sex'], ['personalEmail', 'Personal email'], ['phone', 'Phone'],
  ] as const
  for (const [field, label] of TEXT_FIELDS) {
    const next = (row[field] || '').trim()
    if (next && next !== (cur[field] || '')) {
      FIELD_LABELS[field] = label
      set(field, next, cur[field])
    }
  }
  for (const [field, label] of [['dateOfBirth', 'Date of birth'], ['endDate', 'End date']] as const) {
    const next = row[field]
    if (next && next.slice(0, 10) !== iso(cur[field])) {
      FIELD_LABELS[field] = label
      set(field, new Date(next), cur[field], (v) => (v instanceof Date ? iso(v) : String(v ?? '')))
    }
  }
  set('confirmed', row.confirmed, cur.confirmed)
  set('active', row.active, cur.active)
  return { data, changes }
}

interface Evaluated {
  plan: RosterImportPlan
  toCreate: RosterRow[]
  toUpdate: { id: string; staffId: string; data: Record<string, unknown> }[]
  notInSheetActive: { id: string; staffId: string; name: string }[]
}

// Chosen by the admin in the preview: people to leave out of the import entirely, values typed in to
// fix a missing email / line manager before importing, and people who are not in the sheet but must
// stay active.
export interface RosterImportOptions {
  exclude?: string[]
  overrides?: Record<string, { email?: string; lineManagerStaffId?: string }>
  keepActive?: string[]
}

async function evaluate(tabOverride?: string, opts: RosterImportOptions = {}): Promise<Evaluated> {
  const empty: Evaluated = {
    plan: { sheetName: '', totalRows: 0, newStaff: 0, changedStaff: 0, unchangedStaff: 0, skippedStaff: 0, notInSheet: [], issues: [], sampleChanges: [] },
    toCreate: [], toUpdate: [], notInSheetActive: [],
  }
  const { sheetName, rows: sheetRows, error } = await readSheetRows(tabOverride)
  if (error) return { ...empty, plan: { ...empty.plan, sheetName, error } }

  const excludedKeys = new Set((opts.exclude || []).map((id) => normKey(id)))
  const keepActiveKeys = new Set((opts.keepActive || []).map((id) => normKey(id)))
  const overrides = new Map(Object.entries(opts.overrides || {}).map(([id, o]) => [normKey(id), o]))
  const rows = sheetRows
    .filter((r) => !excludedKeys.has(normKey(r.staffId)))
    .map((r) => {
      const o = overrides.get(normKey(r.staffId))
      if (!o) return r
      return {
        ...r,
        email: o.email?.trim() ? o.email.trim().toLowerCase() : r.email,
        lineManagerStaffId: o.lineManagerStaffId?.trim() ? o.lineManagerStaffId.trim().toUpperCase() : r.lineManagerStaffId,
      }
    })

  const issues: RosterImportIssue[] = []
  const byKey = new Map<string, RosterRow[]>()
  for (const r of rows) {
    const key = normKey(r.staffId)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(r)
  }

  const all = await prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } })
  const latest = new Map<string, Existing>()
  for (const r of all) latest.set(normKey(r.staffId), r)

  const toCreate: RosterRow[] = []
  const toUpdate: Evaluated['toUpdate'] = []
  const sampleChanges: RosterImportPlan['sampleChanges'] = []
  let unchanged = 0, skipped = 0

  for (const [key, group] of byKey) {
    const row = group[0]
    const name = fullName(row)
    if (group.length > 1) {
      issues.push({ staffId: row.staffId, name, problem: `Staff ID appears ${group.length} times in the sheet — skipped until it is unique.` })
      skipped++
      continue
    }
    if (!row.firstName.trim() && !row.lastName.trim()) {
      issues.push({ staffId: row.staffId, name: '', problem: 'No name on this row — skipped.' })
      skipped++
      continue
    }
    let managerOk = true
    const mgr = row.lineManagerStaffId.trim()
    if (mgr) {
      const mgrKey = normKey(mgr)
      if (mgrKey === key) { managerOk = false; issues.push({ staffId: row.staffId, name, problem: 'Line manager is the person themself — manager not imported.' }) }
      else if (!byKey.has(mgrKey) && !latest.has(mgrKey)) { managerOk = false; issues.push({ staffId: row.staffId, name, problem: `Line manager "${mgr}" is not a Staff ID in the sheet (is it a name instead of an ID?) — manager not imported.` }) }
    } else {
      // The top person (Group MD / CEO) legitimately has no line manager.
      if (!/managing director|gmd|ceo/i.test(row.role)) issues.push({ staffId: row.staffId, name, problem: 'No line manager on this row.' })
    }
    // Meri-movers have no company email address — not a data problem.
    if (!row.email.trim() && !/meri[\s-]*mover/i.test(row.role)) issues.push({ staffId: row.staffId, name, problem: 'No email address.' })
    if (!row.businessUnit.trim()) issues.push({ staffId: row.staffId, name, problem: 'No business unit.' })

    const cur = latest.get(key)
    if (!cur) { toCreate.push({ ...row, lineManagerStaffId: managerOk ? row.lineManagerStaffId : '' }); continue }
    const { data, changes } = diff(row, cur, managerOk)
    if (changes.length === 0) { unchanged++; continue }
    toUpdate.push({ id: cur.id, staffId: cur.staffId, data })
    if (sampleChanges.length < 40) sampleChanges.push({ staffId: cur.staffId, name, changes })
  }

  const notInSheetActive: Evaluated['notInSheetActive'] = []
  for (const [key, cur] of latest) {
    if (!byKey.has(key) && !excludedKeys.has(key) && !keepActiveKeys.has(key) && cur.active) notInSheetActive.push({ id: cur.id, staffId: cur.staffId, name: fullName(cur) })
  }

  return {
    plan: {
      sheetName, totalRows: rows.length, newStaff: toCreate.length, changedStaff: toUpdate.length, unchangedStaff: unchanged,
      skippedStaff: skipped, notInSheet: notInSheetActive.map(({ staffId, name }) => ({ staffId, name })), issues, sampleChanges,
    },
    toCreate, toUpdate, notInSheetActive,
  }
}

export async function previewRosterImport(tab?: string, opts: RosterImportOptions = {}): Promise<RosterImportPlan> {
  return (await evaluate(tab, opts)).plan
}

export async function applyRosterImport(tab?: string, deactivateMissing = false, opts: RosterImportOptions = {}): Promise<RosterImportPlan & { applied: { created: number; updated: number; deactivated: number } }> {
  const ev = await evaluate(tab, opts)
  const none = { created: 0, updated: 0, deactivated: 0 }
  if (ev.plan.error) return { ...ev.plan, applied: none }

  for (let i = 0; i < ev.toUpdate.length; i += 50) {
    await prisma.$transaction(
      ev.toUpdate.slice(i, i + 50).map((u) => prisma.staffRosterRecord.update({ where: { id: u.id }, data: u.data }))
    )
  }
  if (ev.toCreate.length > 0) await importRosterRows(ev.toCreate, `Staff list import (${ev.plan.sheetName})`, null)
  let deactivated = 0
  if (deactivateMissing && ev.notInSheetActive.length > 0) {
    const res = await prisma.staffRosterRecord.updateMany({ where: { id: { in: ev.notInSheetActive.map((s) => s.id) } }, data: { active: false } })
    deactivated = res.count
  }
  invalidateComprehensiveStaffListCache()
  return { ...ev.plan, applied: { created: ev.toCreate.length, updated: ev.toUpdate.length, deactivated } }
}

export async function defaultRosterTab(): Promise<string> {
  const config = await prisma.googleSheetsConfig.findFirst()
  return (config?.rosterSheetName || config?.comprehensiveStaffListSheetName || '').trim()
}
