import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const records = await prisma.promotionRecord.findMany({ orderBy: [{ staffId: 'asc' }, { year: 'asc' }] })
  return NextResponse.json(records)
}

interface PromotionItemInput {
  staffId: string; year: number; previousGrade?: string; newGrade?: string; promoted?: boolean
}

// Upserted by (staffId, year) — a bulk paste that includes an existing person+year just corrects
// that record instead of creating a duplicate, same as re-running the sheet import would.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const items: PromotionItemInput[] = Array.isArray(body.items) ? body.items : [body]
    const valid = items.filter((i) => i.staffId?.trim() && i.year)
    if (valid.length === 0) return NextResponse.json({ error: 'Staff ID and Year are required.' }, { status: 400 })

    const saved = []
    for (const item of valid) {
      saved.push(
        await prisma.promotionRecord.upsert({
          where: { staffId_year: { staffId: item.staffId.trim(), year: Number(item.year) } },
          create: {
            staffId: item.staffId.trim(), year: Number(item.year),
            previousGrade: item.previousGrade?.trim() || null, newGrade: item.newGrade?.trim() || null,
            promoted: !!item.promoted,
          },
          update: {
            previousGrade: item.previousGrade?.trim() || null, newGrade: item.newGrade?.trim() || null,
            promoted: !!item.promoted,
          },
        })
      )
    }
    return NextResponse.json(Array.isArray(body.items) ? { saved: saved.length, items: saved } : saved[0])
  } catch (err) {
    console.error('[hr/talent-management/promotions POST]', err)
    return NextResponse.json({ error: 'Failed to save promotion record(s).' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = (await req.json()) as { id: string }
    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })
    await prisma.promotionRecord.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[hr/talent-management/promotions DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove promotion record.' }, { status: 500 })
  }
}
