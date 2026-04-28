import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseSubscriptionExcel } from '@/lib/excel-parser'
import { normalizeBUName } from '@/lib/bu-normalizer'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const period = (formData.get('period') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors, warnings } = parseSubscriptionExcel(buffer)

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' '), warnings }, { status: 422 })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File parsed but contained no valid rows.', warnings }, { status: 422 })
    }

    const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))

    const buNames = [...new Set(normalizedRows.map((r) => r.businessUnit).filter(Boolean))]
    for (const name of buNames) {
      await prisma.businessUnit.upsert({
        where: { name },
        update: {},
        create: { name, budget: 0, staffCount: 0 },
      })
    }

    const batch = await prisma.uploadBatch.create({
      data: {
        type: 'subscription',
        filename: file.name,
        recordCount: normalizedRows.length,
        period: period || null,
      },
    })

    await prisma.subscriptionRecord.createMany({
      data: normalizedRows.map((r) => ({
        startTime:     r.startTime,
        completionTime:r.completionTime,
        staffId:       r.staffId.toUpperCase(),
        staffName:     r.staffName,
        businessUnit:  r.businessUnit,
        membershipOrg: r.membershipOrg,
        amount:        r.amount,
        batchId:       batch.id,
      })),
    })

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      recordCount: normalizedRows.length,
      warnings,
    })
  } catch (err) {
    console.error('[upload/subscriptions]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
