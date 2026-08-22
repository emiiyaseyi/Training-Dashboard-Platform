import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { connectToSpreadsheet, updateRowByKey } from '@/lib/google-sheets'
import { loadRosterDirectory, managerDisplayName, invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'
import { normalizeStaffIdKey } from '@/lib/staff-id'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const body = await req.json()
    const { staffId, firstName, middleName, lastName, email, businessUnit, lineManagerStaffId } = body as {
      staffId?: string; firstName?: string; middleName?: string; lastName?: string
      email?: string; businessUnit?: string; lineManagerStaffId?: string
    }

    const record = await prisma.staffRosterRecord.update({
      where: { id },
      data: {
        ...(staffId !== undefined && { staffId: staffId.trim() }),
        ...(firstName !== undefined && { firstName: firstName.trim() }),
        ...(middleName !== undefined && { middleName: middleName.trim() || null }),
        ...(lastName !== undefined && { lastName: lastName.trim() }),
        ...(email !== undefined && { email: email.trim() || null }),
        ...(businessUnit !== undefined && { businessUnit: normalizeBUName(businessUnit.trim()) }),
        ...(lineManagerStaffId !== undefined && { lineManagerStaffId: lineManagerStaffId.trim() || null }),
      },
    })

    // If a Line Manager ID was set/changed, resolve that manager and write their derived Name +
    // Email back into the comprehensive staff list sheet, on this staff member's own row — so the
    // sheet stays readable without anyone having to look the manager up by hand. Reported back
    // (not just logged) so the admin can see exactly why it didn't apply, if it didn't.
    let sheetSync: { attempted: boolean; success: boolean; reason?: string } = { attempted: false, success: false }
    if (lineManagerStaffId !== undefined && record.lineManagerStaffId) {
      sheetSync = { attempted: true, success: false }
      try {
        const config = await prisma.googleSheetsConfig.findFirst()
        if (!config?.spreadsheetUrl) {
          sheetSync.reason = 'No spreadsheet configured under Admin -> Live Data Source.'
        } else if (!config.comprehensiveStaffListSheetName) {
          sheetSync.reason = 'No Comprehensive Staff List tab name configured under Admin -> Live Data Source.'
        } else {
          const directory = await loadRosterDirectory()
          const manager = directory.get(normalizeStaffIdKey(record.lineManagerStaffId))
          if (!manager) {
            sheetSync.reason = `Manager "${record.lineManagerStaffId}" not found in the roster or comprehensive list.`
          } else {
            const connection = await connectToSpreadsheet(config.spreadsheetUrl)
            const result = await updateRowByKey(
              connection.spreadsheetId,
              config.comprehensiveStaffListSheetName,
              connection.accessToken,
              ['staffid', 'staffno', 'employeeid', 'employeeno', 'id'],
              record.staffId,
              [
                { columnCandidates: ['linemanagerid', 'linemanagerstaffid'], value: manager.staffId },
                { columnCandidates: ['linemanagername'], value: managerDisplayName(manager) },
                { columnCandidates: ['linemanageremail'], value: manager.email || '' },
              ]
            )
            if (!result.rowFound) {
              sheetSync.reason = `Staff ID "${record.staffId}" not found as a row in the "${config.comprehensiveStaffListSheetName}" tab.`
            } else if (result.missingColumns.length > 0) {
              sheetSync.reason = `Row found, but couldn't find column(s): ${result.missingColumns.join(', ')}.`
            } else {
              sheetSync.success = true
              invalidateComprehensiveStaffListCache()
            }
          }
        }
      } catch (syncErr) {
        sheetSync.reason = syncErr instanceof Error ? syncErr.message : 'Unknown error.'
        console.error('[admin/staff-quality/[id]] line manager sheet sync failed', syncErr)
      }
    }

    return NextResponse.json({ ...record, sheetSync })
  } catch (err) {
    console.error('[admin/staff-quality/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update staff record.' }, { status: 500 })
  }
}
