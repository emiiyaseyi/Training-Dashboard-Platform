import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { connectToSpreadsheet, updateRowByKey } from '@/lib/google-sheets'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'

interface AcceptItem {
  id: string
  staffId: string
  email: string
}

interface ItemResult {
  id: string
  success: boolean
  error?: string
  sheetSync: { attempted: boolean; success: boolean; reason?: string }
}

// Accepts one or more Email/Name Mismatch corrections (singly or in bulk from the admin UI):
// updates the DB row, then — same write-back as the single-record editor's Line Manager sync —
// pushes the corrected email into the Email column of the configured "Comprehensive Staff List"
// sheet tab, keyed by Staff ID, so the next scheduled roster sync doesn't pull the old wrong value
// back in and silently overwrite this correction (see src/app/api/admin/staff-quality/[id]/route.ts
// for the same pattern applied to Line Manager fields).
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => null)
  const items = (body?.items ?? []) as AcceptItem[]
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'No items to accept.' }, { status: 400 })
  }

  const config = await prisma.googleSheetsConfig.findFirst()
  let connection: Awaited<ReturnType<typeof connectToSpreadsheet>> | null = null
  let connectError: string | null = null
  if (config?.spreadsheetUrl && config.comprehensiveStaffListSheetName) {
    try {
      connection = await connectToSpreadsheet(config.spreadsheetUrl)
    } catch (err) {
      connectError = err instanceof Error ? err.message : 'Could not connect to the spreadsheet.'
    }
  }

  const results: ItemResult[] = []
  for (const item of items) {
    const sheetSync: ItemResult['sheetSync'] = { attempted: false, success: false }
    try {
      await prisma.staffRosterRecord.update({ where: { id: item.id }, data: { email: item.email.trim() } })
      invalidateComprehensiveStaffListCache()

      if (!config?.spreadsheetUrl) {
        sheetSync.reason = 'No spreadsheet configured under Admin -> Live Data Source.'
      } else if (!config.comprehensiveStaffListSheetName) {
        sheetSync.reason = 'No Comprehensive Staff List tab name configured under Admin -> Live Data Source.'
      } else if (connectError || !connection) {
        sheetSync.attempted = true
        sheetSync.reason = connectError || 'Could not connect to the spreadsheet.'
      } else {
        sheetSync.attempted = true
        const result = await updateRowByKey(
          connection.spreadsheetId,
          config.comprehensiveStaffListSheetName,
          connection.accessToken,
          ['staffid', 'staffno', 'employeeid', 'employeeno', 'id'],
          item.staffId,
          [{ columnCandidates: ['email', 'emailaddress', 'staffemail', 'workemail'], value: item.email.trim() }]
        )
        if (!result.rowFound) {
          sheetSync.reason = `Staff ID "${item.staffId}" not found as a row in the "${config.comprehensiveStaffListSheetName}" tab.`
        } else if (result.missingColumns.length > 0) {
          sheetSync.reason = `Row found, but couldn't find an Email column.`
        } else {
          sheetSync.success = true
        }
      }

      results.push({ id: item.id, success: true, sheetSync })
    } catch (err) {
      console.error('[admin/staff-quality/email-mismatches]', err)
      results.push({ id: item.id, success: false, error: err instanceof Error ? err.message : 'Failed to update.', sheetSync })
    }
  }

  if (results.some((r) => r.sheetSync.success)) invalidateComprehensiveStaffListCache()

  return NextResponse.json({ results })
}
