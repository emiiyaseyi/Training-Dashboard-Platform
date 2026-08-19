import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeStaffId, normalizeEmail } from '@/lib/permissions'

// Public, unauthenticated — called from the login form to tell the user immediately if a
// Staff ID/email isn't recognised, and to decide whether to show a password field at all.
export async function POST(req: NextRequest) {
  try {
    const { identifier } = (await req.json()) as { identifier?: string }
    const idAsStaffId = normalizeStaffId(identifier)
    const idAsEmail = normalizeEmail(identifier)
    if (!idAsStaffId && !idAsEmail) return NextResponse.json({ exists: false, requiresPassword: true })

    const user = await prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [
          ...(idAsStaffId ? [{ staffId: idAsStaffId }] : []),
          ...(idAsEmail ? [{ email: idAsEmail }] : []),
        ],
      },
      select: { requiresPassword: true },
    })

    return NextResponse.json({ exists: !!user, requiresPassword: user?.requiresPassword ?? true })
  } catch (err) {
    console.error('[auth/lookup]', err)
    return NextResponse.json({ exists: false, requiresPassword: true, error: true })
  }
}
