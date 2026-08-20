import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { connectToSpreadsheet, updateRowByKey } from '@/lib/google-sheets'
import { loadRosterDirectory, managerDisplayName } from '@/lib/staff-directory'
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

    // Best-effort: if a Line Manager ID was set/changed, resolve that manager and write their
    // derived Name + Email back into the comprehensive staff list sheet, on this staff member's
    // own row — so the sheet stays readable without anyone having to look the manager up by hand.
    if (lineManagerStaffId !== undefined && record.lineManagerStaffId) {
      try {
        const config = await prisma.googleSheetsConfig.findFirst()
        if (config?.spreadsheetUrl && config.comprehensiveStaffListSheetName) {
          const directory = await loadRosterDirectory()
          const manager = directory.get(normalizeStaffIdKey(record.lineManagerStaffId))
          if (manager) {
            const connection = await connectToSpreadsheet(config.spreadsheetUrl)
            await updateRowByKey(
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
          }
        }
      } catch (syncErr) {
        console.error('[admin/staff-quality/[id]] line manager sheet sync failed', syncErr)
      }
    }

    return NextResponse.json(record)
  } catch (err) {
    console.error('[admin/staff-quality/[id] PUT]', err)
    return NextResponse.json({ error: 'Failed to update staff record.' }, { status: 500 })
  }
}
