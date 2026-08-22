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

// Accepts either a single exemption ({ year, staffId/name/email, reason }) or a batch
// ({ year, items: [{ staffId/name/email, reason }, ...] }) — the panel's search-and-collect flow
// stages several picks (each with its own reason) before saving them all in one call.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('talent-members', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { year, staffId, name, email, reason, items } = body as {
      year: number; staffId?: string; name?: string; email?: string; reason?: string
      items?: { staffId?: string; name?: string; email?: string; reason?: string }[]
    }
    if (!year) return NextResponse.json({ error: 'Year is required.' }, { status: 400 })

    const rows = Array.isArray(items) ? items : [{ staffId, name, email, reason }]
    const toCreate = rows
      .filter((r) => r.staffId?.trim() || r.name?.trim() || r.email?.trim())
      .map((r) => ({
        year,
        staffId: r.staffId?.trim() || null,
        name: r.name?.trim() || null,
        email: r.email?.trim().toLowerCase() || null,
        reason: r.reason?.trim() || null,
      }))

    if (toCreate.length === 0) {
      return NextResponse.json({ error: 'Enter a name, Staff ID, or email for at least one exempted staff member.' }, { status: 400 })
    }

    const created = await prisma.$transaction(toCreate.map((data) => prisma.talentMemberExemption.create({ data })))
    return NextResponse.json(Array.isArray(items) ? { added: created.length } : created[0])
  } catch (err) {
    console.error('[admin/talent-member-exemptions POST]', err)
    return NextResponse.json({ error: 'Failed to save exemption(s).' }, { status: 500 })
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
