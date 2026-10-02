import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const records = await prisma.mobilityRecord.findMany({ orderBy: [{ staffId: 'asc' }, { year: 'asc' }] })
  return NextResponse.json(records)
}

interface MobilityItemInput {
  staffId: string; year: number; newBusinessUnit?: string; newRole?: string; employmentStatus?: string
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
      saved.push(
        await prisma.mobilityRecord.upsert({
          where: { staffId_year: { staffId: item.staffId.trim(), year: Number(item.year) } },
          create: {
            staffId: item.staffId.trim(), year: Number(item.year),
            newBusinessUnit: item.newBusinessUnit?.trim() || null, newRole: item.newRole?.trim() || null,
            changeStatus: (item.newBusinessUnit?.trim() || item.newRole?.trim()) ? 'Changed' : 'No Change',
            employmentStatus: item.employmentStatus === 'Exited' ? 'Exited' : 'Active',
          },
          update: {
            newBusinessUnit: item.newBusinessUnit?.trim() || null, newRole: item.newRole?.trim() || null,
            changeStatus: (item.newBusinessUnit?.trim() || item.newRole?.trim()) ? 'Changed' : 'No Change',
            employmentStatus: item.employmentStatus === 'Exited' ? 'Exited' : 'Active',
          },
        })
      )
    }
    return NextResponse.json(Array.isArray(body.items) ? { saved: saved.length, items: saved } : saved[0])
  } catch (err) {
    console.error('[hr/talent-management/mobility POST]', err)
    return NextResponse.json({ error: 'Failed to save mobility record(s).' }, { status: 500 })
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
