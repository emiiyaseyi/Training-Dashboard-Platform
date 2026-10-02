import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { mirrorMobilityToSheet } from '@/lib/tm-records-mirror'
import type { MobilityRecord } from '@prisma/client'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const records = await prisma.mobilityRecord.findMany({ orderBy: [{ staffId: 'asc' }, { year: 'asc' }] })
  return NextResponse.json(records)
}

interface MobilityItemInput {
  staffId: string; name?: string; year: number; newBusinessUnit?: string; newRole?: string; employmentStatus?: string
}

const bu = (v?: string) => (v?.trim() ? normalizeBUName(v.trim()) : null)

async function syncToSheet(record: MobilityRecord): Promise<MobilityRecord> {
  const result = await mirrorMobilityToSheet(record)
  if (!result.attempted) return record
  return prisma.mobilityRecord.update({
    where: { id: record.id },
    data: { sheetSyncedAt: result.success ? new Date() : null, sheetSyncError: result.success ? null : result.message },
  })
}

// Upserted by (staffId, year) — same reasoning as promotions/route.ts.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const items: MobilityItemInput[] = Array.isArray(body.items) ? body.items : [body]
    const valid = items.filter((i) => i.staffId?.trim() && i.year)
    if (valid.length === 0) return NextResponse.json({ error: 'Staff ID and Year are required.' }, { status: 400 })

    const saved = []
    for (const item of valid) {
      const newBusinessUnit = bu(item.newBusinessUnit)
      const record = await prisma.mobilityRecord.upsert({
        where: { staffId_year: { staffId: item.staffId.trim(), year: Number(item.year) } },
        create: {
          staffId: item.staffId.trim(), name: item.name?.trim() || null, year: Number(item.year),
          newBusinessUnit, newRole: item.newRole?.trim() || null,
          changeStatus: (newBusinessUnit || item.newRole?.trim()) ? 'Changed' : 'No Change',
          employmentStatus: item.employmentStatus === 'Exited' ? 'Exited' : 'Active',
        },
        update: {
          name: item.name?.trim() || null, newBusinessUnit, newRole: item.newRole?.trim() || null,
          changeStatus: (newBusinessUnit || item.newRole?.trim()) ? 'Changed' : 'No Change',
          employmentStatus: item.employmentStatus === 'Exited' ? 'Exited' : 'Active',
        },
      })
      saved.push(await syncToSheet(record))
    }
    return NextResponse.json(Array.isArray(body.items) ? { saved: saved.length, items: saved } : saved[0])
  } catch (err) {
    console.error('[hr/talent-management/mobility POST]', err)
    return NextResponse.json({ error: 'Failed to save mobility record(s).' }, { status: 500 })
  }
}

// Edits an existing row in place by id — see promotions/route.ts PUT for why this is separate
// from the POST upsert above.
export async function PUT(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as { id: string } & MobilityItemInput
    if (!body.id || !body.staffId?.trim() || !body.year) {
      return NextResponse.json({ error: 'Staff ID and Year are required.' }, { status: 400 })
    }
    const newBusinessUnit = bu(body.newBusinessUnit)
    const updated = await prisma.mobilityRecord.update({
      where: { id: body.id },
      data: {
        staffId: body.staffId.trim(), name: body.name?.trim() || null, year: Number(body.year),
        newBusinessUnit, newRole: body.newRole?.trim() || null,
        changeStatus: (newBusinessUnit || body.newRole?.trim()) ? 'Changed' : 'No Change',
        employmentStatus: body.employmentStatus === 'Exited' ? 'Exited' : 'Active',
      },
    })
    return NextResponse.json(await syncToSheet(updated))
  } catch (err) {
    console.error('[hr/talent-management/mobility PUT]', err)
    return NextResponse.json({ error: 'Failed to update mobility record.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = (await req.json()) as { id: string }
    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })
    await prisma.mobilityRecord.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[hr/talent-management/mobility DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove mobility record.' }, { status: 500 })
  }
}
