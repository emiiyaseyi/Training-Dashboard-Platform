import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const records = await prisma.strategicCommitteeRecord.findMany({ orderBy: [{ committee: 'asc' }, { name: 'asc' }] })
  return NextResponse.json(records)
}

interface CommitteeItemInput {
  staffId?: string; name: string; committee: string
}

// Not upserted by a unique key the way Promotion/Mobility/Performance are — a person can
// legitimately sit on more than one committee, so this only skips an exact (staffId, committee)
// duplicate (to keep a bulk re-paste idempotent) rather than treating staffId alone as the key.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const items: CommitteeItemInput[] = Array.isArray(body.items) ? body.items : [body]
    const valid = items.filter((i) => i.name?.trim() && i.committee?.trim())
    if (valid.length === 0) return NextResponse.json({ error: 'Name and Committee are required.' }, { status: 400 })

    const saved = []
    for (const item of valid) {
      const staffId = item.staffId?.trim() || null
      const existing = staffId
        ? await prisma.strategicCommitteeRecord.findFirst({ where: { staffId, committee: item.committee.trim() } })
        : await prisma.strategicCommitteeRecord.findFirst({ where: { staffId: null, name: item.name.trim(), committee: item.committee.trim() } })
      if (existing) {
        saved.push(await prisma.strategicCommitteeRecord.update({ where: { id: existing.id }, data: { name: item.name.trim() } }))
      } else {
        saved.push(await prisma.strategicCommitteeRecord.create({ data: { staffId, name: item.name.trim(), committee: item.committee.trim() } }))
      }
    }
    return NextResponse.json(Array.isArray(body.items) ? { saved: saved.length, items: saved } : saved[0])
  } catch (err) {
    console.error('[hr/talent-management/committees POST]', err)
    return NextResponse.json({ error: 'Failed to save committee record(s).' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = (await req.json()) as { id: string }
    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })
    await prisma.strategicCommitteeRecord.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[hr/talent-management/committees DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove committee record.' }, { status: 500 })
  }
}
