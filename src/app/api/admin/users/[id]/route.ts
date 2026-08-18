import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeStaffId, normalizeEmail, PAGE_KEYS, PERMISSION_LEVELS } from '@/lib/permissions'

type UpdateInput = {
  staffId?: string | null
  email?: string | null
  name?: string
  isSuperAdmin?: boolean
  businessUnitScope?: string
  requiresPassword?: boolean
  isActive?: boolean
  resetPassword?: boolean
  permissions?: Record<string, string>
}

async function assertNotLastSuperAdmin(userId: string, becomingNonAdmin: boolean) {
  if (!becomingNonAdmin) return
  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target?.isSuperAdmin) return
  const superAdminCount = await prisma.user.count({ where: { isSuperAdmin: true, isActive: true } })
  if (superAdminCount <= 1) {
    throw new Error('Cannot remove the last remaining Super Admin.')
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    const input: UpdateInput = await req.json()

    const removingAdmin = input.isSuperAdmin === false
    const deactivating = input.isActive === false
    await assertNotLastSuperAdmin(id, removingAdmin || deactivating)

    const data: Record<string, unknown> = {}
    if (input.staffId !== undefined) data.staffId = normalizeStaffId(input.staffId)
    if (input.email !== undefined) data.email = normalizeEmail(input.email)
    if (input.name !== undefined) data.name = input.name.trim()
    if (input.isSuperAdmin !== undefined) data.isSuperAdmin = input.isSuperAdmin
    if (input.businessUnitScope !== undefined) data.businessUnitScope = input.businessUnitScope
    if (input.isActive !== undefined) data.isActive = input.isActive

    if (input.requiresPassword !== undefined) {
      data.requiresPassword = input.requiresPassword
      if (!input.requiresPassword) data.passwordHash = null
    }

    if (input.resetPassword) {
      const current = await prisma.user.findUnique({ where: { id } })
      const secret = normalizeStaffId(input.staffId ?? current?.staffId) || normalizeEmail(input.email ?? current?.email)
      if (!secret) throw new Error('Cannot reset password without a Staff ID or email on file.')
      data.passwordHash = await bcrypt.hash(secret, 10)
      data.requiresPassword = true
      data.mustChangePassword = true
    }

    if (input.permissions) {
      const permissionsEntries = Object.entries(input.permissions).filter(
        ([page, level]) => PAGE_KEYS.includes(page as (typeof PAGE_KEYS)[number]) && PERMISSION_LEVELS.includes(level as (typeof PERMISSION_LEVELS)[number])
      )
      await prisma.userPagePermission.deleteMany({ where: { userId: id } })
      data.permissions = { create: permissionsEntries.map(([page, level]) => ({ page, level })) }
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      include: { permissions: true },
    })

    return NextResponse.json({
      id: updated.id,
      staffId: updated.staffId,
      email: updated.email,
      name: updated.name,
      isSuperAdmin: updated.isSuperAdmin,
      businessUnitScope: updated.businessUnitScope,
      requiresPassword: updated.requiresPassword,
      isActive: updated.isActive,
      permissions: Object.fromEntries(updated.permissions.map((p) => [p.page, p.level])),
    })
  } catch (err) {
    console.error('[admin/users PUT]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update user.' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const { id } = await params
    await assertNotLastSuperAdmin(id, true)
    await prisma.user.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/users DELETE]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete user.' }, { status: 400 })
  }
}
