import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { normalizeStaffId, normalizeEmail } from '@/lib/permissions'
import { authConfig } from '@/auth.config'

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: 'Staff ID or Email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const rawIdentifier = typeof credentials?.identifier === 'string' ? credentials.identifier : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        const idAsStaffId = normalizeStaffId(rawIdentifier)
        const idAsEmail = normalizeEmail(rawIdentifier)
        if (!idAsStaffId && !idAsEmail) return null

        const user = await prisma.user.findFirst({
          where: {
            isActive: true,
            OR: [
              ...(idAsStaffId ? [{ staffId: idAsStaffId }] : []),
              ...(idAsEmail ? [{ email: idAsEmail }] : []),
            ],
          },
          include: { permissions: true },
        })
        if (!user) return null

        if (user.requiresPassword) {
          if (!password || !user.passwordHash) return null
          const valid = await bcrypt.compare(password, user.passwordHash)
          if (!valid) return null
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          staffId: user.staffId,
          isSuperAdmin: user.isSuperAdmin,
          businessUnitScope: user.businessUnitScope,
          mustChangePassword: user.mustChangePassword,
          permissions: Object.fromEntries(user.permissions.map((p) => [p.page, p.level])),
        }
      },
    }),
  ],
})
