import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 })
    }

    const { newPassword } = (await req.json()) as { newPassword: string }
    if (!newPassword || newPassword.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters.' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash, requiresPassword: true, mustChangePassword: false },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[account/change-password POST]', err)
    return NextResponse.json({ error: 'Failed to change password.' }, { status: 500 })
  }
}
