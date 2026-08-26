import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import type { Prisma } from '@prisma/client'

// Same gate as User Access / user management (admin-settings) — who logged in, where they went,
// and what admin actions ran is at least as sensitive as the user accounts themselves.
export async function GET(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const params = req.nextUrl.searchParams
  const action = params.get('action')
  const q = params.get('q')?.trim()
  const from = params.get('from')
  const to = params.get('to')
  const limit = Math.min(500, parseInt(params.get('limit') || '200') || 200)

  const where: Prisma.AuditLogEntryWhereInput = {}
  if (action && action !== 'ALL') where.action = action
  if (q) {
    where.OR = [
      { userName: { contains: q } },
      { userEmail: { contains: q } },
      { detail: { contains: q } },
    ]
  }
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const entries = await prisma.auditLogEntry.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return NextResponse.json(entries)
}
