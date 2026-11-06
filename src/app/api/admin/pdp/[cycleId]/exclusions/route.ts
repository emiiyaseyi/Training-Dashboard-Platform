import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaffLoose } from '@/lib/staff-directory'

// Persists "leave this person out of future launches" per track (staff = Track A, manager =
// Track B) — see PDPLaunchExclusion's schema comment. Same add/remove-by-staffId pattern as the
// manager-override route.
export async function POST(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const body = await req.json().catch(() => ({}))
  const track = body.track === 'manager' ? 'manager' : body.track === 'staff' ? 'staff' : null
  const staffIdentifier = typeof body.staffId === 'string' ? body.staffId.trim() : ''
  if (!track) return NextResponse.json({ error: 'track must be "staff" or "manager".' }, { status: 400 })
  if (!staffIdentifier) return NextResponse.json({ error: 'A staff member is required.' }, { status: 400 })

  const directory = await loadRosterDirectory()
  const staff = resolveStaffLoose(staffIdentifier, directory)
  if (!staff) return NextResponse.json({ error: `"${staffIdentifier}" wasn't found in the roster.` }, { status: 400 })

  const exclusion = await prisma.pDPLaunchExclusion.upsert({
    where: { cycleId_track_staffId: { cycleId, track, staffId: staff.staffId } },
    create: { cycleId, track, staffId: staff.staffId, staffName: staff.name },
    update: { staffName: staff.name },
  })
  return NextResponse.json(exclusion)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const { searchParams } = new URL(req.url)
  const track = searchParams.get('track')
  const staffId = searchParams.get('staffId')
  if (track !== 'staff' && track !== 'manager') return NextResponse.json({ error: 'track must be "staff" or "manager".' }, { status: 400 })
  if (!staffId) return NextResponse.json({ error: 'staffId is required.' }, { status: 400 })

  await prisma.pDPLaunchExclusion.deleteMany({ where: { cycleId, track, staffId } })
  return NextResponse.json({ success: true })
}
