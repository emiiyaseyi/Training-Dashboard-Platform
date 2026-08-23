import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { invalidateComprehensiveStaffListCache } from '@/lib/staff-directory'
import { getOrCreateNativeBatch } from '@/lib/import-records'
import { connectToSpreadsheet, appendMirrorRow } from '@/lib/google-sheets'

// Roster uploads accumulate over time (each re-upload adds new rows rather than replacing old
// ones) — same "most recent wins per Staff ID" convention as loadRosterDirectory() and the Yet to
// Attend report, so the Employees page shows one row per real person, not one per historical
// upload of them.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const all = await prisma.staffRosterRecord.findMany({ orderBy: { createdAt: 'asc' } })
    const latestByKey = new Map<string, (typeof all)[number]>()
    for (const r of all) latestByKey.set(normalizeStaffIdKey(r.staffId), r)

    const employees = [...latestByKey.values()].map((r) => ({
      id: r.id,
      staffId: r.staffId,
      firstName: r.firstName,
      middleName: r.middleName,
      lastName: r.lastName,
      name: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' '),
      email: r.email,
      businessUnit: r.businessUnit,
      department: r.department,
      role: r.role,
      employmentType: r.employmentType,
      active: r.active,
      lineManagerStaffId: r.lineManagerStaffId,
    }))

    return NextResponse.json(employees)
  } catch (err) {
    console.error('[admin/employees GET]', err)
    return NextResponse.json({ error: 'Failed to load employees.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { staffId, firstName, middleName, lastName, email, businessUnit, department, role, employmentType, lineManagerStaffId } = body as {
      staffId?: string; firstName?: string; middleName?: string; lastName?: string
      email?: string; businessUnit?: string; department?: string; role?: string
      employmentType?: string; lineManagerStaffId?: string
    }

    if (!staffId?.trim() || !firstName?.trim() || !lastName?.trim() || !businessUnit?.trim()) {
      return NextResponse.json({ error: 'Staff ID, first name, last name, and Business Unit are required.' }, { status: 400 })
    }

    const normalizedBU = normalizeBUName(businessUnit.trim())
    await prisma.businessUnit.upsert({ where: { name: normalizedBU }, update: {}, create: { name: normalizedBU, budget: 0, staffCount: 0 } })

    const batch = await getOrCreateNativeBatch('roster', 'Manually added — Employees page')
    const record = await prisma.staffRosterRecord.create({
      data: {
        staffId: staffId.trim().toUpperCase(),
        firstName: firstName.trim(),
        middleName: middleName?.trim() || null,
        lastName: lastName.trim(),
        email: email?.trim().toLowerCase() || null,
        businessUnit: normalizedBU,
        department: department?.trim() || null,
        role: role?.trim() || null,
        employmentType: employmentType?.trim() || null,
        lineManagerStaffId: lineManagerStaffId?.trim().toUpperCase() || null,
        batchId: batch.id,
      },
    })
    invalidateComprehensiveStaffListCache()

    // Best-effort mirror into the Comprehensive Staff List sheet, if configured — matches the
    // pattern used for every other "add via the platform" flow (Talent Members, KSS/Subscription
    // manual entries). Never blocks the create on failure; the admin still sees the new employee
    // in the platform either way, just told whether the sheet copy also worked.
    let sheetSync: { attempted: boolean; success: boolean; reason?: string } = { attempted: false, success: false }
    try {
      const config = await prisma.googleSheetsConfig.findFirst()
      if (!config?.spreadsheetUrl) {
        sheetSync.reason = 'No spreadsheet configured under Admin -> Live Data Source.'
      } else if (!config.comprehensiveStaffListSheetName) {
        sheetSync.reason = 'No Comprehensive Staff List tab name configured under Admin -> Live Data Source.'
      } else {
        sheetSync = { attempted: true, success: false }
        const connection = await connectToSpreadsheet(config.spreadsheetUrl)
        await appendMirrorRow(connection.spreadsheetId, config.comprehensiveStaffListSheetName, connection.accessToken, [
          { label: 'Staff ID', candidates: ['staffno', 'employeeid', 'employeeno', 'id'], value: record.staffId },
          { label: 'Name', candidates: ['fullname', 'staffname', 'employeename'], value: [record.firstName, record.middleName, record.lastName].filter(Boolean).join(' ') },
          { label: 'First Name', candidates: ['first'], value: record.firstName },
          { label: 'Last Name', candidates: ['surname', 'last'], value: record.lastName },
          { label: 'Email', candidates: ['emailaddress', 'staffemail', 'workemail'], value: record.email || '' },
          { label: 'Business Unit', candidates: ['businessunits', 'bu', 'costcenter'], value: record.businessUnit },
          { label: 'Department', candidates: ['dept', 'division', 'team'], value: record.department || '' },
          { label: 'Job Role', candidates: ['role', 'jobtitle', 'position'], value: record.role || '' },
          { label: 'Line Manager ID', candidates: ['linemanagerstaffid', 'reportsto', 'managerstaffid'], value: record.lineManagerStaffId || '' },
        ])
        sheetSync.success = true
      }
    } catch (syncErr) {
      sheetSync.reason = syncErr instanceof Error ? syncErr.message : 'Unknown error.'
      console.error('[admin/employees POST] sheet mirror failed', syncErr)
    }

    return NextResponse.json({ id: record.id, sheetSync })
  } catch (err) {
    console.error('[admin/employees POST]', err)
    return NextResponse.json({ error: 'Failed to add employee.' }, { status: 500 })
  }
}
