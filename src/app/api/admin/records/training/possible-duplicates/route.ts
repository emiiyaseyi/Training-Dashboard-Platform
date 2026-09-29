import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { normalizeStaffIdKey } from '@/lib/staff-id'
import { normalizeTrainingNameKey } from '@/lib/training-name'

// Same real person named differently across the two rows (a middle name present on one, dropped
// on the other — "Olabanjo John Igunnu" vs "Olabanjo Igunnu") still needs to land in the same
// group when there's no Staff ID to key off instead. Only the FIRST and LAST whitespace-separated
// tokens have to match — anything in between is treated as an optional middle name, same
// tolerance buildFullName (staff-name.ts) already gives dash-only middle names elsewhere.
function firstLastNameKey(fullName: string): string {
  const tokens = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  if (tokens.length === 1) return tokens[0]
  return `${tokens[0]}|${tokens[tokens.length - 1]}`
}

// Same person, same training name — almost always the same real attendance recorded twice (a
// re-sync, a manual re-add, or a literal duplicate row from an import) rather than two genuinely
// separate cohorts of the same course, WHETHER OR NOT the duplicate rows happen to share a Month/
// Year — a same-month duplicate is just as real as a cross-month one, and used to be silently
// excluded here by a filter that only looked for records spanning more than one Month/Year.
// Grouped by Staff ID when the record has one (falls back to first+last name otherwise) +
// training name, loosely normalized the same way the rest of this app's training matching does.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const all = await prisma.trainingRecord.findMany({
      select: {
        id: true, staffId: true, staffName: true, businessUnit: true, training: true, month: true, year: true,
        cost: true, hours: true, trainingType: true, capability: true, vendor: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const groups = new Map<string, typeof all>()
    for (const r of all) {
      const personKey = normalizeStaffIdKey(r.staffId) || firstLastNameKey(r.staffName)
      if (!personKey) continue
      const key = `${personKey}|${normalizeTrainingNameKey(r.training)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }

    const duplicates = [...groups.values()]
      .filter((records) => records.length > 1)
      .map((records) => ({
        staffName: records[0].staffName,
        staffId: records[0].staffId,
        training: records[0].training,
        records: records
          .map((r) => ({
            id: r.id, businessUnit: r.businessUnit, month: r.month, year: r.year,
            cost: r.cost, hours: r.hours, trainingType: r.trainingType, capability: r.capability, vendor: r.vendor,
            createdAt: r.createdAt.toISOString(),
          }))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      }))
      .sort((a, b) => a.staffName.localeCompare(b.staffName))

    return NextResponse.json(duplicates)
  } catch (err) {
    console.error('[admin/records/training/possible-duplicates GET]', err)
    return NextResponse.json({ error: 'Failed to load possible duplicate trainings.' }, { status: 500 })
  }
}
