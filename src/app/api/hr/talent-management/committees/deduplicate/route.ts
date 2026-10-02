import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// One-time cleanup for duplicate StrategicCommitteeRecord rows created by a race condition in the
// sheet import (fixed in tm-sheets-import.ts — this only cleans up what already landed before that
// fix). Groups by (staffId ?? name, committee), keeps the most-recently-updated row in each group,
// deletes the rest.
export async function POST() {
  const gate = await requirePermission('hr-talent-management', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const all = await prisma.strategicCommitteeRecord.findMany({ orderBy: { createdAt: 'desc' } })
    const groups = new Map<string, typeof all>()
    for (const r of all) {
      const key = `${r.staffId ?? `name:${r.name?.trim().toLowerCase()}`}|${r.committee}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }

    const toDelete: string[] = []
    for (const group of groups.values()) {
      if (group.length <= 1) continue
      // Prefer keeping a row that actually has a resolved Staff ID over a stale null-staffId one
      // for the same name, and among ties keep the most recently created (already sorted desc).
      const keeper = group.find((r) => r.staffId) || group[0]
      for (const r of group) if (r.id !== keeper.id) toDelete.push(r.id)
    }

    if (toDelete.length > 0) {
      await prisma.strategicCommitteeRecord.deleteMany({ where: { id: { in: toDelete } } })
    }
    return NextResponse.json({ deleted: toDelete.length, remaining: all.length - toDelete.length })
  } catch (err) {
    console.error('[hr/talent-management/committees/deduplicate POST]', err)
    return NextResponse.json({ error: 'Failed to deduplicate committee records.' }, { status: 500 })
  }
}
