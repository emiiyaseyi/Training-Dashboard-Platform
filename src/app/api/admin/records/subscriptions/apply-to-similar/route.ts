import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Same idea as the Training sibling: after editing one subscription's organization name or
// amount, offer to apply that same change to every other record still filed under the ORIGINAL
// membership organization name — e.g. correcting a membership fee or a misspelled org name
// everywhere it appears, not just for the one person who happened to get edited first.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { originalMembershipOrg, excludeId, changes } = await req.json() as {
      originalMembershipOrg: string
      excludeId: string
      changes: { membershipOrg?: string; amount?: number }
    }
    if (!originalMembershipOrg?.trim() || !changes || Object.keys(changes).length === 0) {
      return NextResponse.json({ error: 'originalMembershipOrg and changes are required.' }, { status: 400 })
    }

    const key = originalMembershipOrg.trim().toLowerCase()
    const candidates = await prisma.subscriptionRecord.findMany({ select: { id: true, membershipOrg: true } })
    const ids = candidates.filter((r) => r.id !== excludeId && r.membershipOrg.trim().toLowerCase() === key).map((r) => r.id)

    if (ids.length === 0) return NextResponse.json({ updated: 0 })

    const data: Record<string, unknown> = {}
    if (changes.membershipOrg !== undefined) data.membershipOrg = changes.membershipOrg.trim()
    if (changes.amount !== undefined) data.amount = Number(changes.amount)

    const result = await prisma.subscriptionRecord.updateMany({ where: { id: { in: ids } }, data })
    return NextResponse.json({ updated: result.count })
  } catch (err) {
    console.error('[admin/records/subscriptions/apply-to-similar POST]', err)
    return NextResponse.json({ error: 'Failed to apply to similar subscriptions.' }, { status: 500 })
  }
}
