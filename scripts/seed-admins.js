// One-time seed for the two super admin accounts. Safe to re-run (upserts).
// Usage: node scripts/seed-admins.js
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const SUPER_ADMINS = [
  { staffId: 'MSL-0218', name: 'Super Admin (MSL-0218)' },
  { staffId: 'MSL-0176', name: 'Super Admin (MSL-0176)' },
]

async function main() {
  for (const admin of SUPER_ADMINS) {
    const passwordHash = await bcrypt.hash(admin.staffId, 10)
    const user = await prisma.user.upsert({
      where: { staffId: admin.staffId },
      update: { isSuperAdmin: true, isActive: true },
      create: {
        staffId: admin.staffId,
        name: admin.name,
        isSuperAdmin: true,
        businessUnitScope: 'ALL',
        requiresPassword: true,
        mustChangePassword: true,
        passwordHash,
      },
    })
    console.log(`✓ ${user.staffId} — login password is "${admin.staffId}" (forced change on first login)`)
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
