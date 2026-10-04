import { prisma } from './prisma'
import { connectToSpreadsheet, moveRowToDeletedTab } from './google-sheets'

export type DeletedRecordType = 'training' | 'kss' | 'subscription'

const DELETED_TAB_NAME: Record<DeletedRecordType, string> = {
  training: 'Deleted Trainings',
  kss: 'Deleted KSS',
  subscription: 'Deleted Subscriptions',
}

const SOURCE_SHEET_CONFIG_FIELD: Record<DeletedRecordType, 'trainingSheetName' | 'kssSheetName' | 'subscriptionSheetName'> = {
  training: 'trainingSheetName',
  kss: 'kssSheetName',
  subscription: 'subscriptionSheetName',
}

// Best-effort removal of the matching row from the live Google Sheet, moving it to a "Deleted
// <Type>" tab in the same spreadsheet — never throws; a failure (no sheet configured, ambiguous
// match, connection error) is reported back as a reason string rather than blocking the delete,
// since the DB-side archive below is the part that must always succeed.
async function attemptSheetMove(
  recordType: DeletedRecordType,
  matchColumns: { columnCandidates: string[]; value: string }[],
): Promise<{ moved: boolean; reason?: string }> {
  try {
    const config = await prisma.googleSheetsConfig.findFirst()
    const sheetName = config?.[SOURCE_SHEET_CONFIG_FIELD[recordType]]
    if (!config?.spreadsheetUrl || !sheetName) {
      return { moved: false, reason: 'No Google Sheets source configured for this record type.' }
    }
    const { spreadsheetId, accessToken } = await connectToSpreadsheet(config.spreadsheetUrl)
    return await moveRowToDeletedTab(spreadsheetId, sheetName, DELETED_TAB_NAME[recordType], accessToken, matchColumns)
  } catch (err) {
    return { moved: false, reason: err instanceof Error ? err.message : 'Unknown error moving the sheet row.' }
  }
}

// Archives a record to DeletedRecord (so a mistaken delete is recoverable and there's an audit
// trail) and attempts the matching Google Sheet row move — called BEFORE the actual
// prisma.<table>.delete() in each DELETE route, so the archive always lands even if the sheet
// side can't be resolved.
export async function archiveDeletedRecord(
  recordType: DeletedRecordType,
  data: Record<string, unknown>,
  deletedBy: { name?: string | null; email?: string | null },
  matchColumns: { columnCandidates: string[]; value: string }[],
): Promise<{ sheetMoved: boolean; sheetMoveError: string | null }> {
  const sheetResult = await attemptSheetMove(recordType, matchColumns)
  await prisma.deletedRecord.create({
    data: {
      recordType,
      data: JSON.stringify(data),
      deletedByName: deletedBy.name || null,
      deletedByEmail: deletedBy.email || null,
      sheetMoved: sheetResult.moved,
      sheetMoveError: sheetResult.moved ? null : (sheetResult.reason || null),
    },
  })
  return { sheetMoved: sheetResult.moved, sheetMoveError: sheetResult.moved ? null : (sheetResult.reason || null) }
}
