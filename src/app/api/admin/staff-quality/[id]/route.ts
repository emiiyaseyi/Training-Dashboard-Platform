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
    const { staffId, firstName, middleName, lastName, email, businessUnit, lineManagerStaffId, department, role, employmentType, active } = body as {
      staffId?: string; firstName?: string; middleName?: string; lastName?: string
      email?: string; businessUnit?: string; lineManagerStaffId?: string
      department?: string; role?: string; employmentType?: string; active?: boolean
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
        ...(department !== undefined && { department: department.trim() || null }),
        ...(role !== undefined && { role: role.trim() || null }),
        ...(employmentType !== undefined && { employmentType: employmentType.trim() || null }),
        ...(active !== undefined && { active }),
      },
    })
    invalidateComprehensiveStaffListCache() // this DB edit alone changes what loadRosterDirectory() returns, regardless of the sheet sync below

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
            const managerFields = [
              { columnCandidates: ['linemanagerid', 'linemanagerstaffid'], value: manager.staffId },
              { columnCandidates: ['linemanagername'], value: managerDisplayName(manager) },
              { columnCandidates: ['linemanageremail'], value: manager.email || '' },
            ]
            const keyCandidates = ['staffid', 'staffno', 'employeeid', 'employeeno', 'id']
            const result = await updateRowByKey(connection.spreadsheetId, config.comprehensiveStaffListSheetName, connection.accessToken, keyCandidates, record.staffId, managerFields)
            // The scheduled Staff Roster sync re-imports its own tab and treats any difference from
            // the database as a change — so if that tab still names the OLD manager, it would
            // overwrite this edit on the next run. Write the same correction there too (best effort;
            // a tab that has no matching row/columns just isn't touched).
            const rosterTab = config.rosterSheetName?.trim()
            if (rosterTab && rosterTab.toLowerCase() !== config.comprehensiveStaffListSheetName.trim().toLowerCase()) {
              try {
                await updateRowByKey(connection.spreadsheetId, rosterTab, connection.accessToken, keyCandidates, record.staffId, managerFields)
              } catch (rosterErr) {
                console.error('[admin/staff-quality/[id]] roster tab line manager write-back failed', rosterErr)
              }
            }
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

    // If Active/Inactive was toggled, write the same status back into whichever status-like
    // column the comprehensive staff list sheet actually has — same candidate names
    // excel-parser.ts's roster reader already looks for, so this stays consistent with however
    // the NEXT scheduled sync re-reads this column (an "Exited"/"Active" value here round-trips
    // correctly through parseActiveFromStatus). Independent of the line-manager sync above; both
    // can fire on the same request if both fields changed together.
    let statusSheetSync: { attempted: boolean; success: boolean; reason?: string } = { attempted: false, success: false }
    if (active !== undefined) {
      statusSheetSync = { attempted: true, success: false }
      try {
        const config = await prisma.googleSheetsConfig.findFirst()
        if (!config?.spreadsheetUrl) {
          statusSheetSync.reason = 'No spreadsheet configured under Admin -> Live Data Source.'
        } else if (!config.comprehensiveStaffListSheetName) {
          statusSheetSync.reason = 'No Comprehensive Staff List tab name configured under Admin -> Live Data Source.'
        } else {
          const connection = await connectToSpreadsheet(config.spreadsheetUrl)
          const statusValue = active ? 'Active' : 'Exited'
          const result = await updateRowByKey(
            connection.spreadsheetId,
            config.comprehensiveStaffListSheetName,
            connection.accessToken,
            ['staffid', 'staffno', 'employeeid', 'employeeno', 'id'],
            record.staffId,
            [
              { columnCandidates: ['employmentstatus', 'exitstatus', 'staffactivestatus', 'activestatus'], value: statusValue },
              { columnCandidates: ['confirmationstatus', 'confirmed', 'isconfirmed', 'staffstatus', 'status'], value: statusValue },
            ]
          )
          if (!result.rowFound) {
            statusSheetSync.reason = `Staff ID "${record.staffId}" not found as a row in the "${config.comprehensiveStaffListSheetName}" tab.`
          } else if (result.missingColumns.length >= 2) {
            // Both candidate groups missing — the sheet has no status-like column at all.
            statusSheetSync.reason = `Row found, but no status/employment-status column exists in the "${config.comprehensiveStaffListSheetName}" tab.`
          } else {
            statusSheetSync.success = true
            invalidateComprehensiveStaffListCache()
          }
        }
      } catch (syncErr) {
        statusSheetSync.reason = syncErr instanceof Error ? syncErr.message : 'Unknown error.'
        console.error('[admin/staff-quality/[id]] status sheet sync failed', syncErr)
      }
    }

    return NextResponse.json({ ...record, sheetSync, statusSheetSync })
  } catch (err) {
    console.error('[admin/staff-quality/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update staff record.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await prisma.staffRosterRecord.delete({ where: { id } })
    invalidateComprehensiveStaffListCache()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/staff-quality/[id] DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete staff record.' }, { status: 500 })
  }
}
