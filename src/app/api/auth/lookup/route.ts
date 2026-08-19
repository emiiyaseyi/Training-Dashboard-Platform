import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeStaffId, normalizeEmail } from '@/lib/permissions'

// Public, unauthenticated — called from the login form to decide whether to show a password
// field before the user submits. Always defaults to requiresPassword: true for anything
// ambiguous or not found, so a nonexistent identifier looks the same as a password-protected
// one; only an existing passwordless account distinguishes itself, which is an inherent
// trade-off of supporting passwordless accounts at all.
export async function POST(req: NextRequest) {
  try {
    const { identifier } = (await req.json()) as { identifier?: string }
    const idAsStaffId = normalizeStaffId(identifier)
    const idAsEmail = normalizeEmail(identifier)
    if (!idAsStaffId && !idAsEmail) return NextResponse.json({ requiresPassword: true })

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

    return NextResponse.json({ requiresPassword: user?.requiresPassword ?? true })
  } catch (err) {
    console.error('[auth/lookup]', err)
    return NextResponse.json({ requiresPassword: true })
  }
}
