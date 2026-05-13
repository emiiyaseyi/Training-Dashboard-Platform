import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseKSSExcel } from '@/lib/excel-parser'
import { normalizeBUName } from '@/lib/bu-normalizer'
import { MONTHS } from '@/lib/filter-types'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const period = (formData.get('period') as string | null) ?? ''

    if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors, warnings } = parseKSSExcel(buffer)

    if (errors.length > 0) return NextResponse.json({ error: errors.join(' '), warnings }, { status: 422 })
    if (rows.length === 0) return NextResponse.json({ error: 'No valid rows found.', warnings }, { status: 422 })

    const year = period ? parseInt(period.split('-')[0]) : new Date().getFullYear()
    const normalizedRows = rows.map((r) => ({ ...r, businessUnit: normalizeBUName(r.businessUnit) }))

    const buNames = [...new Set(normalizedRows.map((r) => r.businessUnit).filter(Boolean))]
    for (const name of buNames) {
      await prisma.businessUnit.upsert({
        where: { name }, update: {}, create: { name, budget: 0, staffCount: 0 },
      })
    }

    const batch = await prisma.uploadBatch.create({
      data: { type: 'kss', filename: file.name, recordCount: normalizedRows.length, period: period || null },
    })

    await prisma.kSSRecord.createMany({
      data: normalizedRows.map((r) => ({
        staffId:         r.staffId.toUpperCase(),
        staffName:       r.staffName,
        businessUnit:    r.businessUnit,
        durationMinutes: r.durationMinutes,
        month:           r.month || null,
        year,
        batchId:         batch.id,
      })),
    })

    return NextResponse.json({ success: true, batchId: batch.id, recordCount: normalizedRows.length, warnings })
  } catch (err) {
    console.error('[upload/kss]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
