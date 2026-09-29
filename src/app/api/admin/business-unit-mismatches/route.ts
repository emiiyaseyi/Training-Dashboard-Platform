import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// The alias-based "Normalize Business Unit names" button (normalize-business-units/route.ts) only
// fixes a value already listed in bu-normalizer.ts's hardcoded CANONICAL_NAMES map — anything not
// in that list (a fresh typo, an abbreviation nobody's seen before) stays broken until a developer
// adds it there. This is the self-service alternative: finds every DISTINCT businessUnit value,
// across every table that stores one as a free string, that doesn't exactly match a real
// BusinessUnit.name — with a per-table count — so an admin can map it to the correct one and
// bulk-fix every row themselves, without waiting on a code change.
const TABLES = [
  { key: 'trainingRecord', label: 'Training' },
  { key: 'feedbackRecord', label: 'Feedback' },
  { key: 'subscriptionRecord', label: 'Subscription' },
  { key: 'kSSRecord', label: 'KSS' },
  { key: 'managerReviewRecord', label: 'Manager Review' },
  { key: 'staffRosterRecord', label: 'Staff Roster' },
  { key: 'trainingSchedule', label: 'Training Schedule' },
] as const

export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const canonical = await prisma.businessUnit.findMany({ select: { name: true } })
  const canonicalNames = new Set(canonical.map((b) => b.name))

  // { value -> { table -> count } }
  const mismatches = new Map<string, Record<string, number>>()

  for (const t of TABLES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: { businessUnit: string }[] = await (prisma as any)[t.key].findMany({ select: { businessUnit: true } })
    const counts = new Map<string, number>()
    for (const r of all) {
      const value = r.businessUnit?.trim()
      if (!value || canonicalNames.has(value)) continue
      counts.set(value, (counts.get(value) || 0) + 1)
    }
    for (const [value, count] of counts) {
      const entry = mismatches.get(value) || {}
      entry[t.label] = (entry[t.label] || 0) + count
      mismatches.set(value, entry)
    }
  }

  const results = [...mismatches.entries()]
    .map(([value, byTable]) => ({ value, byTable, total: Object.values(byTable).reduce((s, n) => s + n, 0) }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({ mismatches: results, canonicalNames: [...canonicalNames].sort() })
}
