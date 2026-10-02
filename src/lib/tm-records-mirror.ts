// Best-effort courtesy export for TM Mobility/Performance/Committee records — the database is
// always the source of truth (see tm-sheets-import.ts and the admin page), this just keeps the
// Google Sheet tab readable for anyone who wants to glance at it without logging in.
//
// Deliberately NOT implemented for PromotionRecord: TM Promotion's sheet has three different
// columns all literally named "New Grade" (one after each of 2023/2024/2025 Promotion). Header-
// name matching (updateRowByKey's whole mechanism) can't tell them apart reliably, and the one
// unambiguous way to target the right one — the New Grade column's position relative to its own
// "20XX Promotion" column — only works for a read (see tm-sheets-import.ts's iNewGrade2025), not
// a write: Sheets' values.update endpoint addresses a cell by column letter, and that letter can
// silently shift if anyone ever reorders the sheet's columns. Writing to the wrong year's grade
// column would corrupt real data with no visible error, which is worse than just not mirroring at
// all — so Promotion edits stay database-only until/unless that sheet is restructured to one row
// per year (the same fix already applied to Mobility's own 2025/2026 columns below).
import { connectToSpreadsheet, appendMirrorRow, updateRowByKey, type MirrorField } from '@/lib/google-sheets'
import { prisma } from '@/lib/prisma'
import type { MobilityRecord, PerformanceAppraisalRecord, StrategicCommitteeRecord } from '@prisma/client'

export interface TMRecordMirrorResult {
  attempted: boolean
  success: boolean
  message: string
}

const STAFFID_CANDIDATES = ['empid', 'staffid', 'staffno', 'employeeid', 'employeeno']
const NAME_CANDIDATES = ['name']

async function getSheetTarget(tabNameField: 'tmInternalMobilitySheetName' | 'tmPerformanceAppraisalSheetName' | 'tmStrategicTeamsSheetName'): Promise<{ spreadsheetId: string; accessToken: string; sheetName: string } | null> {
  const config = await prisma.googleSheetsConfig.findFirst()
  const sheetName = config?.[tabNameField]
  if (!config?.spreadsheetUrl || !sheetName) return null
  const connection = await connectToSpreadsheet(config.spreadsheetUrl)
  return { spreadsheetId: connection.spreadsheetId, accessToken: connection.accessToken, sheetName }
}

// Mobility's 2025/2026 BU and Role live in distinct, unambiguous columns ("2025 New BU" vs
// "2026 New BU"), so — unlike Promotion — which column to target is fully determined by the
// record's own `year` field, with no risk of hitting the wrong one.
export async function mirrorMobilityToSheet(record: MobilityRecord): Promise<TMRecordMirrorResult> {
  const target = await getSheetTarget('tmInternalMobilitySheetName')
  if (!target) return { attempted: false, success: false, message: 'No TM Internal Mobility sheet configured under Admin -> Live Data Source.' }

  try {
    const buCandidates = [`${record.year} new bu`]
    const roleCandidates = [`${record.year} new role`]
    const updates = [
      { columnCandidates: NAME_CANDIDATES, value: record.name || '' },
      { columnCandidates: buCandidates, value: record.newBusinessUnit || '' },
      { columnCandidates: roleCandidates, value: record.newRole || '' },
      { columnCandidates: ['employment status'], value: record.employmentStatus },
    ]
    const result = await updateRowByKey(target.spreadsheetId, target.sheetName, target.accessToken, STAFFID_CANDIDATES, record.staffId, updates)
    if (result.rowFound) return { attempted: true, success: true, message: `Updated existing row in "${target.sheetName}".` }

    const fields: MirrorField[] = [
      { label: 'Emp. ID', candidates: STAFFID_CANDIDATES, value: record.staffId },
      { label: 'Name', candidates: NAME_CANDIDATES, value: record.name || '' },
      { label: `${record.year} New BU`, candidates: buCandidates, value: record.newBusinessUnit || '' },
      { label: `${record.year} New Role`, candidates: roleCandidates, value: record.newRole || '' },
      { label: 'Employment Status', candidates: ['employment status'], value: record.employmentStatus },
    ]
    await appendMirrorRow(target.spreadsheetId, target.sheetName, target.accessToken, fields)
    return { attempted: true, success: true, message: `Synced to "${target.sheetName}".` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[tm-records-mirror mobility]', err)
    return { attempted: true, success: false, message }
  }
}

// H1 2025 / H2 2025 / H1 2026 are each their own unique column, so `period` maps directly to one
// unambiguous target column.
export async function mirrorPerformanceToSheet(record: PerformanceAppraisalRecord): Promise<TMRecordMirrorResult> {
  const target = await getSheetTarget('tmPerformanceAppraisalSheetName')
  if (!target) return { attempted: false, success: false, message: 'No TM Performance Appraisal sheet configured under Admin -> Live Data Source.' }

  try {
    // Database stores 0-100 throughout; the sheet keeps its own original 0-1 decimal convention —
    // this is the one place that gets converted back on the way out (see tm-sheets-import.ts's
    // importPerformanceAppraisal for the matching *100 on the way in).
    const sheetScore = record.score != null ? String(record.score / 100) : ''
    const periodCandidates = [record.period.toLowerCase()]
    const updates = [
      { columnCandidates: NAME_CANDIDATES, value: record.name || '' },
      { columnCandidates: periodCandidates, value: sheetScore },
    ]
    const result = await updateRowByKey(target.spreadsheetId, target.sheetName, target.accessToken, STAFFID_CANDIDATES, record.staffId, updates)
    if (result.rowFound) return { attempted: true, success: true, message: `Updated existing row in "${target.sheetName}".` }

    const fields: MirrorField[] = [
      { label: 'Emp. ID', candidates: STAFFID_CANDIDATES, value: record.staffId },
      { label: 'Name', candidates: NAME_CANDIDATES, value: record.name || '' },
      { label: record.period, candidates: periodCandidates, value: sheetScore },
    ]
    await appendMirrorRow(target.spreadsheetId, target.sheetName, target.accessToken, fields)
    return { attempted: true, success: true, message: `Synced to "${target.sheetName}".` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[tm-records-mirror performance]', err)
    return { attempted: true, success: false, message }
  }
}

// Keyed by Staff ID when present, else Name (the sheet itself has no Emp. ID column) — a person on
// more than one committee only ever gets their FIRST matching sheet row updated, same simplifying
// assumption the sheet's own one-committee-per-row layout already makes; this is a courtesy
// export, not the source of truth, so that's an acceptable trade-off rather than a correctness bug.
export async function mirrorCommitteeToSheet(record: StrategicCommitteeRecord): Promise<TMRecordMirrorResult> {
  const target = await getSheetTarget('tmStrategicTeamsSheetName')
  if (!target) return { attempted: false, success: false, message: 'No TM Strategic Teams sheet configured under Admin -> Live Data Source.' }

  try {
    const keyCandidates = record.staffId ? STAFFID_CANDIDATES : NAME_CANDIDATES
    const keyValue = record.staffId || record.name || ''
    if (keyValue) {
      const result = await updateRowByKey(target.spreadsheetId, target.sheetName, target.accessToken, keyCandidates, keyValue, [
        { columnCandidates: NAME_CANDIDATES, value: record.name || '' },
        { columnCandidates: ['strategic committee'], value: record.committee },
      ])
      if (result.rowFound) return { attempted: true, success: true, message: `Updated existing row in "${target.sheetName}".` }
    }

    const fields: MirrorField[] = [
      { label: 'Name', candidates: NAME_CANDIDATES, value: record.name || '' },
      { label: 'Strategic Committee', candidates: ['strategic committee'], value: record.committee },
    ]
    await appendMirrorRow(target.spreadsheetId, target.sheetName, target.accessToken, fields)
    return { attempted: true, success: true, message: `Synced to "${target.sheetName}".` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[tm-records-mirror committee]', err)
    return { attempted: true, success: false, message }
  }
}
