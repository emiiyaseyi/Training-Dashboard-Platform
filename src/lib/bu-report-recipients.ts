import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { normalizeEmail } from '@/lib/permissions'
import { serializeBUScope } from '@/lib/permissions'

// Finds an existing User by email, or provisions a new one scoped to exactly this Business Unit
// with view access on the pages a BU head needs — same creation shape as Admin -> User Access
// (src/app/api/admin/users/route.ts's createOne), just triggered from the report-recipient form
// instead. Default password is their Staff ID (falling back to email if none is given), same
// platform-wide convention as every other user.
export async function provisionBUHeadUser(businessUnit: string, name: string, email: string, staffId?: string | null): Promise<{ id: string; staffId: string | null }> {
  const normEmail = normalizeEmail(email)
  if (!normEmail) throw new Error('A valid email is required.')

  const existing = await prisma.user.findUnique({ where: { email: normEmail } })
  if (existing) {
    // Already a platform user — leave their existing scope/permissions/password alone (they may
    // already have broader access for other reasons); just make sure they can view this BU's data.
    const currentScope = existing.businessUnitScope
    if (currentScope !== 'ALL' && !currentScope.includes(businessUnit)) {
      let scopeList: string[] = []
      try { scopeList = JSON.parse(currentScope) } catch { scopeList = currentScope ? [currentScope] : [] }
      await prisma.user.update({
        where: { id: existing.id },
        data: { businessUnitScope: serializeBUScope([...scopeList, businessUnit]) },
      })
    }
    await ensureViewPermissions(existing.id)
    return { id: existing.id, staffId: existing.staffId }
  }

  const normStaffId = staffId?.trim().toUpperCase() || null
  const defaultSecret = normStaffId || normEmail
  const passwordHash = await bcrypt.hash(defaultSecret, 10)

  const user = await prisma.user.create({
    data: {
      staffId: normStaffId,
      email: normEmail,
      name: name.trim(),
      isSuperAdmin: false,
      businessUnitScope: serializeBUScope([businessUnit]),
      requiresPassword: true,
      passwordHash,
      mustChangePassword: true,
      permissions: {
        create: [
          { page: 'executive-overview', level: 'view' },
          { page: 'business-units', level: 'view' },
        ],
      },
    },
  })
  return { id: user.id, staffId: user.staffId }
}

async function ensureViewPermissions(userId: string): Promise<void> {
  for (const page of ['executive-overview', 'business-units'] as const) {
    const existing = await prisma.userPagePermission.findUnique({ where: { userId_page: { userId, page } } })
    if (!existing) {
      await prisma.userPagePermission.create({ data: { userId, page, level: 'view' } })
    }
  }
}
