import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { RECOMMENDED_SECTION_ORDER } from '@/lib/pdp-seed'

// Re-applies the recommended section order (PDP core -> Digital Skill Assessment -> Confirmation
// -> manager-only sections) to an EXISTING cycle's already-seeded sections — for a cycle that was
// seeded before this ordering existed, or whose order has since drifted. Matches by `key`, so it
// only ever touches `order`, never a section's content/questions. A custom admin-added section
// (key not in RECOMMENDED_SECTION_ORDER) keeps its current relative position among the others
// that also fall outside the list, rather than being moved.
export async function POST(_req: Request, { params }: { params: Promise<{ cycleId: string }> }) {
  const gate = await requirePermission('pdp', 'admin')
  if (gate instanceof NextResponse) return gate

  const { cycleId } = await params
  const sections = await prisma.pDPSection.findMany({ where: { cycleId }, orderBy: { order: 'asc' } })

  const indexFor = (key: string) => {
    const i = RECOMMENDED_SECTION_ORDER.indexOf(key)
    return i === -1 ? RECOMMENDED_SECTION_ORDER.length : i
  }
  // Stable sort (ES2019+) preserves each section's current relative position among ties (i.e.
  // among sections not in the recommended list), rather than shuffling them.
  const reordered = [...sections].sort((a, b) => indexFor(a.key) - indexFor(b.key))

  await prisma.$transaction(
    reordered.map((section, i) =>
      prisma.pDPSection.update({ where: { id: section.id }, data: { order: i } })
    )
  )

  return NextResponse.json({ success: true, count: reordered.length })
}
