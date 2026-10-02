import { connectToSpreadsheet, appendMirrorRow, updateRowByKey, type MirrorField } from '@/lib/google-sheets'
import { prisma } from '@/lib/prisma'
import { loadRosterDirectory, resolveStaffLooseAny } from '@/lib/staff-directory'
import type { TalentMemberInfo } from '@prisma/client'

export interface TalentMemberRosterMirrorResult {
  attempted: boolean
  success: boolean
  message: string
}

const NAME_CANDIDATES = ['name', 'fullname', 'staffname', 'employeename']
const STAFFID_CANDIDATES = ['empid', 'staffid', 'staffno', 'employeeid', 'employeeno']
const EMAIL_CANDIDATES = ['email', 'emailaddress', 'staffemail', 'workemail']
const BU_CANDIDATES = ['currentbu', 'businessunit', 'bu']
const DOJ_MERISTEM_CANDIDATES = ['dojmeristem']
const DATE_JOINED_TM_CANDIDATES = ['dateofjoiningtm']
const ROLE_CANDIDATES = ['currentrole']
const GRADE_CANDIDATES = ['currentjobgrade', 'currentgrade']
const TIER_CANDIDATES = ['currenttier']
const GENDER_CANDIDATES = ['gender']
const STATUS_CANDIDATES = ['status']

function toSheetDate(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

// Mirrors one Talent Member entry into the sheet tab configured as
// GoogleSheetsConfig.talentMemberSheetName ("Talent Members Info") — the admin's own external
// copy of who's on the TM roster and their enrichment fields. Best-effort: the database row
// (TalentMemberInfo) is always the source of truth for the report itself, this is just a courtesy
// export. Shared by the add route (mirrors immediately), the admin retry action, and the "update
// missing details" backfill.
//
// Updates the existing row in place (keyed by whichever identifier the entry has) before falling
// back to appending a new one — otherwise re-syncing an entry after it's been resolved against
// the staff directory (backfilling a previously-missing Name/Email) would duplicate its row
// instead of fixing it.
export async function mirrorRosterEntryToSheet(entry: TalentMemberInfo): Promise<TalentMemberRosterMirrorResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.spreadsheetUrl || !config.talentMemberSheetName) {
    return { attempted: false, success: false, message: 'No Talent Member sheet configured under Admin -> Live Data Source.' }
  }

  try {
    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    const sheetName = config.talentMemberSheetName

    const fieldUpdates = [
      { columnCandidates: NAME_CANDIDATES, value: entry.name || '' },
      { columnCandidates: STAFFID_CANDIDATES, value: entry.staffId || '' },
      { columnCandidates: EMAIL_CANDIDATES, value: entry.email || '' },
      { columnCandidates: BU_CANDIDATES, value: entry.businessUnit || '' },
      { columnCandidates: DOJ_MERISTEM_CANDIDATES, value: toSheetDate(entry.dojMeristem) },
      { columnCandidates: DATE_JOINED_TM_CANDIDATES, value: toSheetDate(entry.dateJoinedTM) },
      { columnCandidates: ROLE_CANDIDATES, value: entry.currentRole || '' },
      { columnCandidates: GRADE_CANDIDATES, value: entry.currentGrade || '' },
      { columnCandidates: TIER_CANDIDATES, value: entry.currentTier != null ? String(entry.currentTier) : '' },
      { columnCandidates: GENDER_CANDIDATES, value: entry.gender || '' },
      { columnCandidates: STATUS_CANDIDATES, value: entry.status },
    ]

    const keyValue = entry.staffId || entry.email || entry.name
    if (keyValue) {
      const keyCandidates = entry.staffId ? STAFFID_CANDIDATES : entry.email ? EMAIL_CANDIDATES : NAME_CANDIDATES
      const result = await updateRowByKey(connection.spreadsheetId, sheetName, connection.accessToken, keyCandidates, keyValue, fieldUpdates)
      if (result.rowFound) return { attempted: true, success: true, message: `Updated existing row in "${sheetName}".` }
    }

    const fields: MirrorField[] = [
      { label: 'Name', candidates: NAME_CANDIDATES, value: entry.name || '' },
      { label: 'Emp. ID', candidates: STAFFID_CANDIDATES, value: entry.staffId || '' },
      { label: 'Email', candidates: EMAIL_CANDIDATES, value: entry.email || '' },
      { label: 'Current BU', candidates: BU_CANDIDATES, value: entry.businessUnit || '' },
      { label: 'DOJ Meristem', candidates: DOJ_MERISTEM_CANDIDATES, value: toSheetDate(entry.dojMeristem) },
      { label: 'Date of Joining TM', candidates: DATE_JOINED_TM_CANDIDATES, value: toSheetDate(entry.dateJoinedTM) },
      { label: 'Current Role', candidates: ROLE_CANDIDATES, value: entry.currentRole || '' },
      { label: 'Current Job Grade', candidates: GRADE_CANDIDATES, value: entry.currentGrade || '' },
      { label: 'Current Tier', candidates: TIER_CANDIDATES, value: entry.currentTier != null ? String(entry.currentTier) : '' },
      { label: 'Gender', candidates: GENDER_CANDIDATES, value: entry.gender || '' },
      { label: 'Status', candidates: STATUS_CANDIDATES, value: entry.status },
    ]
    await appendMirrorRow(connection.spreadsheetId, sheetName, connection.accessToken, fields)
    return { attempted: true, success: true, message: `Synced to "${sheetName}".` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[talent-member-roster-mirror]', err)
    return { attempted: true, success: false, message }
  }
}

// Re-resolves one roster entry against the current staff directory and backfills any
// missing/stale Staff ID, Name, or Email — used by the "Update Missing Details" bulk action for
// entries that were added before creation-time resolution existed (or before the person had a
// matching directory record). Returns whether anything actually changed.
export async function backfillRosterEntryFromDirectory(
  entry: TalentMemberInfo
): Promise<{ updated: boolean; entry: TalentMemberInfo }> {
  if (!entry.staffId && !entry.name && !entry.email) return { updated: false, entry }

  const directory = await loadRosterDirectory()
  const match = resolveStaffLooseAny(entry, directory)
  if (!match) return { updated: false, entry }

  const needsUpdate = entry.staffId !== match.staffId || entry.name !== match.name || entry.email !== (match.email || null)
  if (!needsUpdate) return { updated: false, entry }

  const updated = await prisma.talentMemberInfo.update({
    where: { id: entry.id },
    data: { staffId: match.staffId, name: match.name, email: match.email || null },
  })
  return { updated: true, entry: updated }
}
