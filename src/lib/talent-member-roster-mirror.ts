import { connectToSpreadsheet, appendMirrorRow, type MirrorField } from '@/lib/google-sheets'
import { prisma } from '@/lib/prisma'
import type { TalentMemberRosterEntry } from '@prisma/client'

export interface TalentMemberRosterMirrorResult {
  attempted: boolean
  success: boolean
  message: string
}

// Mirrors one Talent Member roster entry into the sheet tab configured as
// GoogleSheetsConfig.talentMemberSheetName — the admin's own external copy of who's on the TM
// roster. Best-effort: the database row (TalentMemberRosterEntry) is always the source of truth
// for the report itself, this is just a courtesy export. Shared by the add route (mirrors
// immediately) and the admin retry action.
export async function mirrorRosterEntryToSheet(entry: TalentMemberRosterEntry): Promise<TalentMemberRosterMirrorResult> {
  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config?.spreadsheetUrl || !config.talentMemberSheetName) {
    return { attempted: false, success: false, message: 'No Talent Member sheet configured under Admin -> Live Data Source.' }
  }

  try {
    const connection = await connectToSpreadsheet(config.spreadsheetUrl)
    const sheetName = config.talentMemberSheetName

    const fields: MirrorField[] = [
      { label: 'Name', candidates: ['fullname', 'staffname', 'employeename'], value: entry.name || '' },
      { label: 'Staff ID', candidates: ['staffno', 'employeeid', 'employeeno', 'id'], value: entry.staffId || '' },
      { label: 'Email', candidates: ['emailaddress', 'staffemail', 'workemail'], value: entry.email || '' },
    ]
    await appendMirrorRow(connection.spreadsheetId, sheetName, connection.accessToken, fields)
    return { attempted: true, success: true, message: `Synced to "${sheetName}".` }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.'
    console.error('[talent-member-roster-mirror]', err)
    return { attempted: true, success: false, message }
  }
}
