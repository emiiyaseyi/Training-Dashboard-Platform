import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseTrainingExcel } from '@/lib/excel-parser'
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
    const { rows, errors, warnings } = parseTrainingExcel(buffer)

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' '), warnings }, { status: 422 })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File parsed but contained no valid rows.', warnings }, { status: 422 })
    }

    // Derive year from the period or current year
    const year = period ? parseInt(period.split('-')[0]) : new Date().getFullYear()

    // Normalize BU names before storing
    const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))

    // Auto-create any new BusinessUnit records encountered
    const buNames = [...new Set(normalizedRows.map((r) => r.businessUnit).filter(Boolean))]
    for (const name of buNames) {
      await prisma.businessUnit.upsert({
        where: { name },
        update: {},
        create: { name, budget: 0, staffCount: 0 },
      })
    }

    // Create upload batch
    const batch = await prisma.uploadBatch.create({
      data: {
        type: 'training',
        filename: file.name,
        recordCount: normalizedRows.length,
        period: period || null,
      },
    })

    // Bulk insert records
    await prisma.trainingRecord.createMany({
      data: normalizedRows.map((r) => ({
        serialNo:    r.serialNo,
        staffName:   r.staffName,
        staffId:     r.staffId.toUpperCase(),
        training:    r.training,
        businessUnit:r.businessUnit,
        month:       r.month,
        year,
        cost:        r.cost,
        batchId:     batch.id,
      })),
    })

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      recordCount: normalizedRows.length,
      warnings,
    })
  } catch (err) {
    console.error('[upload/training]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
