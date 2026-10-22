import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { loadRosterDirectory, resolveStaffLoose } from '@/lib/staff-directory'

// Manages the PDP-specific "this person also has a second line manager" exception list — kept
// off StaffRosterRecord on purpose (see prisma/schema.prisma's PDPManagerOverride comment).
export async function POST(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const body = await req.json().catch(() => ({}))
  const staffIdentifier = typeof body.staffId === 'string' ? body.staffId.trim() : ''
  const managerIdentifier = typeof body.secondManagerStaffId === 'string' ? body.secondManagerStaffId.trim() : ''
  if (!staffIdentifier || !managerIdentifier) {
    return NextResponse.json({ error: 'Both a staff member and a second manager are required.' }, { status: 400 })
  }

  const directory = await loadRosterDirectory()
  const staff = resolveStaffLoose(staffIdentifier, directory)
  const manager = resolveStaffLoose(managerIdentifier, directory)
  if (!staff) return NextResponse.json({ error: `"${staffIdentifier}" wasn't found in the roster.` }, { status: 400 })
  if (!manager) return NextResponse.json({ error: `"${managerIdentifier}" wasn't found in the roster.` }, { status: 400 })

  const override = await prisma.pDPManagerOverride.upsert({
    where: { cycleId_staffId: { cycleId, staffId: staff.staffId } },
    create: { cycleId, staffId: staff.staffId, secondManagerStaffId: manager.staffId },
    update: { secondManagerStaffId: manager.staffId },
  })
  return NextResponse.json(override)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const { searchParams } = new URL(req.url)
  const staffId = searchParams.get('staffId')
  if (!staffId) return NextResponse.json({ error: 'staffId is required.' }, { status: 400 })

  await prisma.pDPManagerOverride.deleteMany({ where: { cycleId, staffId } })
  return NextResponse.json({ success: true })
}
