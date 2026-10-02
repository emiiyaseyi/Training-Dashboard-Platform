import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { mirrorRosterEntryToSheet } from '@/lib/talent-member-roster-mirror'
import { normalizeBUName } from '@/lib/bu-normalizer'

export async function GET() {
  const gate = await requirePermission('hr-talent-management', 'view')
  if (gate instanceof NextResponse) return gate

  const entries = await prisma.talentMemberInfo.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json(entries)
}

interface RosterItemInput {
  staffId?: string; name?: string; email?: string; businessUnit?: string
  dojMeristem?: string; dateJoinedTM?: string; currentRole?: string; currentGrade?: string
  currentTier?: number; gender?: string; status?: string
}

async function createOne(item: RosterItemInput) {
  const staffId = item.staffId?.trim() || null
  const data = {
    staffId,
    name: item.name?.trim() || null,
    email: item.email?.trim().toLowerCase() || null,
    businessUnit: item.businessUnit?.trim() ? normalizeBUName(item.businessUnit.trim()) : null,
    dojMeristem: item.dojMeristem ? new Date(item.dojMeristem) : null,
    dateJoinedTM: item.dateJoinedTM ? new Date(item.dateJoinedTM) : null,
    currentRole: item.currentRole?.trim() || null,
    currentGrade: item.currentGrade?.trim() || null,
    currentTier: item.currentTier != null ? Number(item.currentTier) : null,
    gender: item.gender?.trim() || null,
    status: item.status === 'Exited' ? 'Exited' : 'Active',
  }
  // staffId has no DB-level unique constraint (adding one now would fail the next deploy if any
  // duplicates already exist in the live data), so this is the app-level guard against a bulk
  // paste or double-submit silently creating a second roster row for the same person — which
  // would double-count them in every dashboard metric that follows.
  const existing = staffId ? await prisma.talentMemberInfo.findFirst({ where: { staffId } }) : null
  const created = existing
    ? await prisma.talentMemberInfo.update({ where: { id: existing.id }, data })
    : await prisma.talentMemberInfo.create({ data })
  const result = await mirrorRosterEntryToSheet(created)
  if (result.attempted) {
    await prisma.talentMemberInfo.update({
      where: { id: created.id },
      data: { sheetSyncedAt: result.success ? new Date() : null, sheetSyncError: result.success ? null : result.message },
    })
  }
  return created
}

// Accepts either a single item in the body, or { items: RosterItemInput[] } for bulk add — the
// admin page's bulk form posts an array parsed from pasted rows, the individual form posts one.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const items: RosterItemInput[] = Array.isArray(body.items) ? body.items : [body]
    const valid = items.filter((i) => i.staffId?.trim() || i.name?.trim())
    if (valid.length === 0) {
      return NextResponse.json({ error: 'Enter at least a Staff ID or Name.' }, { status: 400 })
    }

    const created = []
    for (const item of valid) created.push(await createOne(item))

    return NextResponse.json(Array.isArray(body.items) ? { added: created.length, items: created } : created[0])
  } catch (err) {
    console.error('[hr/talent-management/roster POST]', err)
    return NextResponse.json({ error: 'Failed to add Talent Member(s).' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { id, staffId, name, email, businessUnit, dojMeristem, dateJoinedTM, currentRole, currentGrade, currentTier, gender, status } = body as {
      id: string; staffId?: string; name?: string; email?: string; businessUnit?: string
      dojMeristem?: string; dateJoinedTM?: string; currentRole?: string; currentGrade?: string
      currentTier?: number; gender?: string; status?: string
    }
    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })

    const updated = await prisma.talentMemberInfo.update({
      where: { id },
      data: {
        staffId: staffId?.trim() || null,
        name: name?.trim() || null,
        email: email?.trim().toLowerCase() || null,
        businessUnit: businessUnit?.trim() ? normalizeBUName(businessUnit.trim()) : null,
        dojMeristem: dojMeristem ? new Date(dojMeristem) : null,
        dateJoinedTM: dateJoinedTM ? new Date(dateJoinedTM) : null,
        currentRole: currentRole?.trim() || null,
        currentGrade: currentGrade?.trim() || null,
        currentTier: currentTier != null ? Number(currentTier) : null,
        gender: gender?.trim() || null,
        status: status === 'Exited' ? 'Exited' : 'Active',
      },
    })

    const result = await mirrorRosterEntryToSheet(updated)
    if (result.attempted) {
      await prisma.talentMemberInfo.update({
        where: { id: updated.id },
        data: { sheetSyncedAt: result.success ? new Date() : null, sheetSyncError: result.success ? null : result.message },
      })
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[hr/talent-management/roster PUT]', err)
    return NextResponse.json({ error: 'Failed to update Talent Member.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = (await req.json()) as { id: string }
    if (!id) return NextResponse.json({ error: 'ID is required.' }, { status: 400 })
    await prisma.talentMemberInfo.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[hr/talent-management/roster DELETE]', err)
    return NextResponse.json({ error: 'Failed to remove Talent Member.' }, { status: 500 })
  }
}
