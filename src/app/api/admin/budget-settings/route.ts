import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Single global toggle: whether Subscription Spend counts against a Business Unit's budget.
// Off by default — subscriptions (professional memberships) are a separate cost category from
// the training budget itself.
export async function GET() {
  try {
    const existing = await prisma.budgetSettings.findFirst()
    return NextResponse.json({ countSubscriptionsInBudget: existing?.countSubscriptionsInBudget ?? false })
  } catch (err) {
    console.error('[admin/budget-settings GET]', err)
    return NextResponse.json({ error: 'Failed to fetch budget settings.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { countSubscriptionsInBudget } = await req.json() as { countSubscriptionsInBudget: boolean }
    const existing = await prisma.budgetSettings.findFirst()
    const updated = existing
      ? await prisma.budgetSettings.update({ where: { id: existing.id }, data: { countSubscriptionsInBudget } })
      : await prisma.budgetSettings.create({ data: { countSubscriptionsInBudget } })
    return NextResponse.json({ countSubscriptionsInBudget: updated.countSubscriptionsInBudget })
  } catch (err) {
    console.error('[admin/budget-settings POST]', err)
    return NextResponse.json({ error: 'Failed to save budget settings.' }, { status: 500 })
  }
}
