import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { mirrorCommitteeToSheet } from '@/lib/tm-records-mirror'
import type { StrategicCommitteeRecord } from '@prisma/client'

async function syncToSheet(record: StrategicCommitteeRecord): Promise<StrategicCommitteeRecord> {
  const result = await mirrorCommitteeToSheet(record)
  if (!result.attempted) return record
  return prisma.strategicCommitteeRecord.update({
    where: { id: record.id },
    data: { sheetSyncedAt: result.success ? new Date() : null, sheetSyncError: result.success ? null : result.message },
  })
}

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const records = await prisma.strategicCommitteeRecord.findMany({ orderBy: [{ committee: 'asc' }, { name: 'asc' }] })
  return NextResponse.json(records)
}

interface CommitteeItemInput {
  staffId?: string; name: string; committee: string; year?: string | number
}

function parseYear(year: string | number | undefined): number | null {
  if (year == null || year === '') return null
  const n = typeof year === 'number' ? year : parseInt(year, 10)
  return Number.isFinite(n) ? n : null
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
      // Always check for a previously-unresolved row (staffId: null) for this exact name+committee
      // FIRST, even when a new Staff ID is being supplied — that's exactly the "resolve an
      // unresolved name" case, and searching only by the new staffId would never find that row
      // (it doesn't have that staffId yet), creating a stray duplicate instead of fixing it.
      const existing =
        (await prisma.strategicCommitteeRecord.findFirst({ where: { staffId: null, name: item.name.trim(), committee: item.committee.trim() } })) ??
        (staffId ? await prisma.strategicCommitteeRecord.findFirst({ where: { staffId, committee: item.committee.trim() } }) : null)
      const year = parseYear(item.year)
      const record = existing
        ? await prisma.strategicCommitteeRecord.update({ where: { id: existing.id }, data: { staffId, name: item.name.trim(), ...(year != null ? { year } : {}) } })
        : await prisma.strategicCommitteeRecord.create({ data: { staffId, name: item.name.trim(), committee: item.committee.trim(), year } })
      saved.push(await syncToSheet(record))
    }
    return NextResponse.json(Array.isArray(body.items) ? { saved: saved.length, items: saved } : saved[0])
  } catch (err) {
    console.error('[hr/talent-management/committees POST]', err)
    return NextResponse.json({ error: 'Failed to save committee record(s).' }, { status: 500 })
  }
}

// Edits an existing row in place by id — needed because the POST upsert above keys off
// (staffId, committee), so correcting the committee name itself there would create a new row
// instead of fixing this one.
export async function PUT(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as { id: string } & CommitteeItemInput
    if (!body.id || !body.name?.trim() || !body.committee?.trim()) {
      return NextResponse.json({ error: 'Name and Committee are required.' }, { status: 400 })
    }
    const updated = await prisma.strategicCommitteeRecord.update({
      where: { id: body.id },
      data: { staffId: body.staffId?.trim() || null, name: body.name.trim(), committee: body.committee.trim(), year: parseYear(body.year) },
    })
    return NextResponse.json(await syncToSheet(updated))
  } catch (err) {
    console.error('[hr/talent-management/committees PUT]', err)
    return NextResponse.json({ error: 'Failed to update committee record.' }, { status: 500 })
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
