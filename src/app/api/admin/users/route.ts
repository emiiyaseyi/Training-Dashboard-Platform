import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeStaffId, normalizeEmail, PAGE_KEYS, PERMISSION_LEVELS } from '@/lib/permissions'

type IncomingUser = {
  staffId?: string | null
  email?: string | null
  name: string
  isSuperAdmin?: boolean
  businessUnitScope?: string
  requiresPassword?: boolean
  permissions?: Record<string, string>
}

export async function GET() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const users = await prisma.user.findMany({
    include: { permissions: true },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      staffId: u.staffId,
      email: u.email,
      name: u.name,
      isSuperAdmin: u.isSuperAdmin,
      businessUnitScope: u.businessUnitScope,
      requiresPassword: u.requiresPassword,
      isActive: u.isActive,
      createdAt: u.createdAt,
      permissions: Object.fromEntries(u.permissions.map((p) => [p.page, p.level])),
    }))
  )
}

async function createOne(input: IncomingUser) {
  const staffId = normalizeStaffId(input.staffId)
  const email = normalizeEmail(input.email)
  if (!staffId && !email) throw new Error(`"${input.name}" needs a Staff ID or email.`)
  if (!input.name?.trim()) throw new Error('Name is required for every user.')

  const requiresPassword = input.requiresPassword ?? true
  const defaultSecret = staffId || email!
  const passwordHash = requiresPassword ? await bcrypt.hash(defaultSecret, 10) : null

  const permissionsEntries = Object.entries(input.permissions || {}).filter(
    ([page, level]) => PAGE_KEYS.includes(page as (typeof PAGE_KEYS)[number]) && PERMISSION_LEVELS.includes(level as (typeof PERMISSION_LEVELS)[number])
  )

  return prisma.user.create({
    data: {
      staffId,
      email,
      name: input.name.trim(),
      isSuperAdmin: !!input.isSuperAdmin,
      businessUnitScope: input.businessUnitScope || 'ALL',
      requiresPassword,
      passwordHash,
      mustChangePassword: requiresPassword,
      permissions: {
        create: permissionsEntries.map(([page, level]) => ({ page, level })),
      },
    },
    include: { permissions: true },
  })
}

// Accepts either a single user object or { users: [...] } for bulk creation.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const inputs: IncomingUser[] = Array.isArray(body.users) ? body.users : [body]

    const created = []
    const errors: string[] = []
    for (const input of inputs) {
      try {
        created.push(await createOne(input))
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Failed to create user.')
      }
    }

    return NextResponse.json({
      created: created.map((u) => ({ id: u.id, name: u.name, staffId: u.staffId, email: u.email })),
      errors,
    })
  } catch (err) {
    console.error('[admin/users POST]', err)
    return NextResponse.json({ error: 'Failed to create user(s). Check that Staff ID/email are unique.' }, { status: 500 })
  }
}
