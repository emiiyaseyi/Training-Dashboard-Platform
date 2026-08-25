import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { provisionBUHeadUser } from '@/lib/bu-report-recipients'

export async function GET() {
  const gate = await requirePermission('report-generation', 'view')
  if (gate instanceof NextResponse) return gate

  const recipients = await prisma.bUReportRecipient.findMany({ orderBy: [{ businessUnit: 'asc' }, { createdAt: 'asc' }] })
  return NextResponse.json(recipients)
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('report-generation', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const businessUnit = normalizeBUName(String(body.businessUnit || '').trim())
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim()
    const staffId = body.staffId ? String(body.staffId).trim() : null
    if (!businessUnit || !name || !email) {
      return NextResponse.json({ error: 'Business Unit, name, and email are required.' }, { status: 400 })
    }

    const user = await provisionBUHeadUser(businessUnit, name, email, staffId)

    const recipient = await prisma.bUReportRecipient.upsert({
      where: { businessUnit_email: { businessUnit, email: email.toLowerCase() } },
      update: { name, staffId: user.staffId, userId: user.id, active: true },
      create: { businessUnit, name, email: email.toLowerCase(), staffId: user.staffId, userId: user.id },
    })
    return NextResponse.json(recipient)
  } catch (err) {
    console.error('[admin/bu-report-recipients POST]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to add recipient.' }, { status: 500 })
  }
}
