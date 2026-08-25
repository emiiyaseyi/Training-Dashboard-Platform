import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { getOrCreateNativeBatch } from '@/lib/import-records'
import { loadRosterDirectory, resolveStaffLoose } from '@/lib/staff-directory'

// Bulk sibling of the single-record KSS entry — one call adds a whole cohort at once, each with
// their OWN duration (a shared group session can still record slightly different attendance
// lengths per person). Each row's identifier (Staff ID, email, or full name) is resolved against
// the roster server-side, so the admin can paste a list without pre-looking anyone up.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { month, year, rows } = (await req.json()) as {
      month?: string; year?: number; rows?: { identifier: string; durationMinutes: number }[]
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Provide at least one row.' }, { status: 400 })
    }

    const directory = await loadRosterDirectory()
    const added: string[] = []
    const notFound: string[] = []
    const invalid: string[] = []
    const toCreate: { staffId: string; staffName: string; businessUnit: string; durationMinutes: number }[] = []

    for (const row of rows) {
      const identifier = row.identifier?.trim()
      if (!identifier) continue
      const duration = Number(row.durationMinutes)
      if (!Number.isFinite(duration) || duration < 0) { invalid.push(identifier); continue }
      const staff = resolveStaffLoose(identifier, directory)
      if (!staff) { notFound.push(identifier); continue }
      toCreate.push({ staffId: staff.staffId, staffName: staff.name, businessUnit: staff.businessUnit, durationMinutes: duration })
      added.push(staff.name)
    }

    if (toCreate.length > 0) {
      const batch = await getOrCreateNativeBatch('kss', 'Manually Added')
      await prisma.kSSRecord.createMany({
        data: toCreate.map((r) => ({
          staffId: r.staffId,
          staffName: r.staffName,
          businessUnit: r.businessUnit,
          durationMinutes: r.durationMinutes,
          month: month || null,
          year: year ? Number(year) : null,
          batchId: batch.id,
        })),
      })
      await prisma.uploadBatch.update({ where: { id: batch.id }, data: { recordCount: { increment: toCreate.length } } })
    }

    return NextResponse.json({ added: added.length, notFound, invalid })
  } catch (err) {
    console.error('[admin/records/kss/bulk POST]', err)
    return NextResponse.json({ error: 'Failed to add KSS records.' }, { status: 500 })
  }
}
