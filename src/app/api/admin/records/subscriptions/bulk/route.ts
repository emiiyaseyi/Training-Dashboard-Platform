import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { getOrCreateNativeBatch } from '@/lib/import-records'
import { loadRosterDirectory, resolveStaffLoose } from '@/lib/staff-directory'

// Bulk sibling of the single-record subscription entry — one call adds a whole cohort at once,
// each with their OWN amount and category (a bulk certification refund run can still cover
// different amounts per person). Each row's identifier (Staff ID, email, or full name) is
// resolved against the roster server-side, so the admin can paste a list without pre-looking
// anyone up.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { month, membershipOrg, rows } = (await req.json()) as {
      month?: string; membershipOrg?: string
      rows?: { identifier: string; amount: number; category?: string; membershipOrg?: string }[]
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Provide at least one row.' }, { status: 400 })
    }

    const directory = await loadRosterDirectory()
    const added: string[] = []
    const notFound: string[] = []
    const invalid: string[] = []
    const toCreate: { staffId: string; staffName: string; businessUnit: string; amount: number; category: string; membershipOrg: string }[] = []

    for (const row of rows) {
      const identifier = row.identifier?.trim()
      if (!identifier) continue
      const amount = Number(row.amount)
      const org = (row.membershipOrg || membershipOrg || '').trim()
      if (!Number.isFinite(amount) || amount < 0 || !org) { invalid.push(identifier); continue }
      const staff = resolveStaffLoose(identifier, directory)
      if (!staff) { notFound.push(identifier); continue }
      toCreate.push({
        staffId: staff.staffId, staffName: staff.name, businessUnit: staff.businessUnit,
        amount, membershipOrg: org, category: row.category === 'certification' ? 'certification' : 'membership',
      })
      added.push(staff.name)
    }

    if (toCreate.length > 0) {
      const batch = await getOrCreateNativeBatch('subscription', 'Manually Added')
      await prisma.subscriptionRecord.createMany({
        data: toCreate.map((r) => ({
          staffId: r.staffId,
          staffName: r.staffName,
          businessUnit: r.businessUnit,
          membershipOrg: r.membershipOrg,
          amount: r.amount,
          category: r.category,
          month: month || null,
          batchId: batch.id,
        })),
      })
      await prisma.uploadBatch.update({ where: { id: batch.id }, data: { recordCount: { increment: toCreate.length } } })
    }

    return NextResponse.json({ added: added.length, notFound, invalid })
  } catch (err) {
    console.error('[admin/records/subscriptions/bulk POST]', err)
    return NextResponse.json({ error: 'Failed to add subscription records.' }, { status: 500 })
  }
}
