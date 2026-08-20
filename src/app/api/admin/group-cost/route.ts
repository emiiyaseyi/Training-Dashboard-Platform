import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'

// Lists distinct training names already uploaded, with attendee counts, so the admin can pick
// from what's actually in the data rather than free-typing a name that might not match anything.
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  try {
    const records = await prisma.trainingRecord.findMany({ select: { training: true } })
    const counts = new Map<string, number>()
    records.forEach((r) => {
      const name = r.training?.trim()
      if (!name) return
      counts.set(name, (counts.get(name) ?? 0) + 1)
    })
    const trainings = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json(trainings)
  } catch (err) {
    console.error('[admin/group-cost GET]', err)
    return NextResponse.json({ error: 'Failed to fetch training names.' }, { status: 500 })
  }
}

// Distributes a lump-sum group training cost across Business Units, proportional to how many
// already-uploaded attendee records exist per BU for that training — then (optionally) writes
// that per-BU share back onto the individual TrainingRecord rows' cost field, split evenly among
// that BU's own attendees, so it flows through the existing Strategic Learning Initiatives totals.
export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  try {
    const body = await req.json()
    const { training, totalAmount, apply, confirmDuplicate } = body as {
      training: string; totalAmount: number; apply?: boolean; confirmDuplicate?: boolean
    }

    if (!training || !training.trim()) return NextResponse.json({ error: 'Training name is required.' }, { status: 400 })
    if (!totalAmount || totalAmount <= 0) return NextResponse.json({ error: 'Total amount must be greater than 0.' }, { status: 400 })

    // Flag if this training has already had a group cost applied before — likely a duplicate
    // entry unless the admin explicitly confirms they want to apply another one.
    const priorApplications = await prisma.groupCostDistribution.findMany({
      where: { training: { equals: training.trim() } },
      orderBy: { appliedAt: 'desc' },
    })
    if (apply && priorApplications.length > 0 && !confirmDuplicate) {
      return NextResponse.json({
        duplicate: true,
        priorApplications: priorApplications.map((p) => ({ totalAmount: p.totalAmount, appliedAt: p.appliedAt })),
      }, { status: 409 })
    }

    const records = await prisma.trainingRecord.findMany({
      where: { training: { equals: training.trim() } },
    })

    if (records.length === 0) {
      return NextResponse.json({ error: `No uploaded records found for training "${training}". Upload attendee data for this training first.` }, { status: 404 })
    }

    // This cost only shows up under "Strategic Learning Initiatives" if these records are tagged
    // with a Training Type classified as "other" — flag it if they're not, so the admin knows to
    // fix the classification (in Admin → Training Types, or by re-uploading with the right type).
    const trainingTypes = await prisma.trainingType.findMany()
    const otherTypeNames = new Set(trainingTypes.filter((t) => t.classification === 'other').map((t) => t.name.toLowerCase()))
    const misclassifiedCount = records.filter((r) => !r.trainingType || !otherTypeNames.has(r.trainingType.toLowerCase())).length
    const classificationWarning = misclassifiedCount > 0
      ? `${misclassifiedCount} of ${records.length} matched record(s) aren't tagged with a Training Type classified as "other" — this amount will count as Formal Training Spend for those, not Strategic Learning Initiatives, until the Training Type is corrected.`
      : null

    const byBU = new Map<string, typeof records>()
    records.forEach((r) => {
      const bu = r.businessUnit || 'Unassigned'
      if (!byBU.has(bu)) byBU.set(bu, [])
      byBU.get(bu)!.push(r)
    })

    const totalCount = records.length
    const breakdown = [...byBU.entries()]
      .map(([businessUnit, rows]) => {
        const share = Math.round((totalAmount * (rows.length / totalCount)) * 100) / 100
        const perPerson = Math.round((share / rows.length) * 100) / 100
        return { businessUnit, attendeeCount: rows.length, share, perPersonAmount: perPerson, recordIds: rows.map((r) => r.id) }
      })
      .sort((a, b) => b.share - a.share)

    if (apply) {
      await prisma.$transaction([
        ...breakdown.flatMap((b) =>
          b.recordIds.map((id) => prisma.trainingRecord.update({ where: { id }, data: { cost: b.perPersonAmount } }))
        ),
        prisma.groupCostDistribution.create({
          data: {
            training: training.trim(),
            totalAmount,
            breakdown: JSON.stringify(breakdown.map(({ businessUnit, attendeeCount, share, perPersonAmount }) => ({ businessUnit, attendeeCount, share, perPersonAmount }))),
          },
        }),
      ])
    }

    return NextResponse.json({
      training: training.trim(),
      totalAmount,
      totalAttendees: totalCount,
      applied: !!apply,
      classificationWarning,
      breakdown: breakdown.map(({ businessUnit, attendeeCount, share, perPersonAmount }) => ({ businessUnit, attendeeCount, share, perPersonAmount })),
    })
  } catch (err) {
    console.error('[admin/group-cost POST]', err)
    return NextResponse.json({ error: 'Failed to distribute group cost.' }, { status: 500 })
  }
}
