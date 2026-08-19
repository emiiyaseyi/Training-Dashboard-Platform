import { NextRequest, NextResponse } from 'next/server'
import { parseFeedbackExcel } from '@/lib/excel-parser'
import { importFeedbackRows } from '@/lib/import-records'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const period = (formData.get('period') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { rows, errors, warnings } = parseFeedbackExcel(buffer)

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(' '), warnings }, { status: 422 })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File parsed but contained no valid rows.', warnings }, { status: 422 })
    }

    const result = await importFeedbackRows(rows, file.name, period || null, warnings)

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      recordCount: result.recordCount,
      warnings: result.warnings,
    })
  } catch (err) {
    console.error('[upload/feedback]', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
