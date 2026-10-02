import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const records = await prisma.performanceAppraisalRecord.findMany({ orderBy: [{ staffId: 'asc' }, { period: 'asc' }] })
  return NextResponse.json(records)
}

interface PerformanceItemInput {
  staffId: string; name?: string; period: string; score?: number
}

// Upserted by (staffId, period). score is stored exactly as entered — a 0-1 decimal (e.g. 0.75),
// matching the sheet's own scale; the dashboard converts to a /5 display value, never stored
// pre-converted.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const items: PerformanceItemInput[] = Array.isArray(body.items) ? body.items : [body]
    const valid = items.filter((i) => i.staffId?.trim() && i.period?.trim())
    if (valid.length === 0) return NextResponse.json({ error: 'Staff ID and Period are required.' }, { status: 400 })

    const saved = []
    for (const item of valid) {
      saved.push(
        await prisma.performanceAppraisalRecord.upsert({
          where: { staffId_period: { staffId: item.staffId.trim(), period: item.period.trim() } },
          create: { staffId: item.staffId.trim(), name: item.name?.trim() || null, period: item.period.trim(), score: item.score != null ? Number(item.score) : null },
          update: { name: item.name?.trim() || null, score: item.score != null ? Number(item.score) : null },
        })
      )
    }
    return NextResponse.json(Array.isArray(body.items) ? { saved: saved.length, items: saved } : saved[0])
  } catch (err) {
    console.error('[hr/talent-management/performance POST]', err)
    return NextResponse.json({ error: 'Failed to save appraisal record(s).' }, { status: 500 })
  }
}

// Edits an existing row in place by id — see promotions/route.ts PUT for why this is separate
// from the POST upsert above.
export async function PUT(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as { id: string } & PerformanceItemInput
    if (!body.id || !body.staffId?.trim() || !body.period?.trim()) {
      return NextResponse.json({ error: 'Staff ID and Period are required.' }, { status: 400 })
    }
    const updated = await prisma.performanceAppraisalRecord.update({
      where: { id: body.id },
      data: { staffId: body.staffId.trim(), name: body.name?.trim() || null, period: body.period.trim(), score: body.score != null ? Number(body.score) : null },
    })
    return NextResponse.json(updated)
  } catch (err) {
    console.error('[hr/talent-management/performance PUT]', err)
    return NextResponse.json({ error: 'Failed to update appraisal record.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = (await req.json()) as { id: string }
    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })
    await prisma.performanceAppraisalRecord.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[hr/talent-management/performance DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove appraisal record.' }, { status: 500 })
  }
}
