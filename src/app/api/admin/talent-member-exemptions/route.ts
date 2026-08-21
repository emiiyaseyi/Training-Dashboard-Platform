import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

export async function GET(req: NextRequest) {
  const gate = await requirePermission('talent-members', 'view')
  if (gate instanceof NextResponse) return gate

  const year = parseInt(req.nextUrl.searchParams.get('year') || '') || new Date().getFullYear()
  try {
    const exemptions = await prisma.talentMemberExemption.findMany({ where: { year }, orderBy: { createdAt: 'desc' } })
    return NextResponse.json(exemptions)
  } catch (err) {
    console.error('[admin/talent-member-exemptions GET]', err)
    return NextResponse.json({ error: 'Failed to fetch exemptions.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { year, staffId, name, email, reason } = body as {
      year: number; staffId?: string; name?: string; email?: string; reason?: string
    }
    if (!year) return NextResponse.json({ error: 'Year is required.' }, { status: 400 })
    if (!staffId?.trim() && !name?.trim() && !email?.trim()) {
      return NextResponse.json({ error: 'Enter a name, Staff ID, or email for the exempted staff member.' }, { status: 400 })
    }

    const exemption = await prisma.talentMemberExemption.create({
      data: {
        year,
        staffId: staffId?.trim() || null,
        name: name?.trim() || null,
        email: email?.trim().toLowerCase() || null,
        reason: reason?.trim() || null,
      },
    })
    return NextResponse.json(exemption)
  } catch (err) {
    console.error('[admin/talent-member-exemptions POST]', err)
    return NextResponse.json({ error: 'Failed to save exemption.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await req.json() as { id: string }
    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })
    await prisma.talentMemberExemption.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/talent-member-exemptions DELETE]', err)
    return NextResponse.json({ error: 'Failed to delete exemption.' }, { status: 500 })
  }
}
