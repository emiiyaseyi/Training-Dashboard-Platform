import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { getOrCreateNativeBatch } from '@/lib/import-records'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const search = req.nextUrl.searchParams.get('search')?.trim().toLowerCase() || ''
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1'))

    const all = await prisma.subscriptionRecord.findMany({ orderBy: { createdAt: 'desc' } })
    let rows = all
    if (search) {
      rows = rows.filter((r) =>
        r.staffName.toLowerCase().includes(search) || r.staffId.toLowerCase().includes(search) ||
        r.businessUnit.toLowerCase().includes(search) || r.membershipOrg.toLowerCase().includes(search)
      )
    }

    const total = rows.length
    const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    return NextResponse.json({ rows: paged, total, pageSize: PAGE_SIZE })
  } catch (err) {
    console.error('[admin/records/subscriptions GET]', err)
    return NextResponse.json({ error: 'Failed to fetch subscription records.' }, { status: 500 })
  }
}

// Manual single-record entry — same underlying table as a bulk Subscriptions upload, just added
// one row at a time through the interface instead of via a spreadsheet.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json() as {
      staffId: string; staffName: string; businessUnit: string; membershipOrg: string; amount: number; month?: string
    }
    if (!body.staffId?.trim() || !body.staffName?.trim() || !body.businessUnit?.trim() || !body.membershipOrg?.trim()) {
      return NextResponse.json({ error: 'Staff ID, Name, Business Unit, and Membership Organization are required.' }, { status: 400 })
    }
    if (!Number.isFinite(Number(body.amount)) || Number(body.amount) < 0) {
      return NextResponse.json({ error: 'Amount must be a non-negative number.' }, { status: 400 })
    }

    const batch = await getOrCreateNativeBatch('subscription', 'Manually Added')
    const record = await prisma.subscriptionRecord.create({
      data: {
        staffId: body.staffId.trim().toUpperCase(),
        staffName: body.staffName.trim(),
        businessUnit: normalizeBUName(body.businessUnit.trim()),
        membershipOrg: body.membershipOrg.trim(),
        amount: Number(body.amount),
        month: body.month || null,
        batchId: batch.id,
      },
    })
    await prisma.uploadBatch.update({ where: { id: batch.id }, data: { recordCount: { increment: 1 } } })
    return NextResponse.json(record)
  } catch (err) {
    console.error('[admin/records/subscriptions POST]', err)
    return NextResponse.json({ error: 'Failed to add subscription record.' }, { status: 500 })
  }
}
