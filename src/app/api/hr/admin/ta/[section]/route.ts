import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { TA_ADMIN_SECTIONS, type TaAdminSection } from '@/lib/ta-admin-sections'
import {
  fetchRange, getTaAccessToken,
  parseHiresRows, parsePipelineRows, parseInternalMobilityRows, parseConversionRows, parseNotConvertedRows, parseVacancyRows,
} from '@/lib/ta-sheets'
import { updateSheetRow, appendSheetRow, clearSheetRow, type SheetFieldValues } from '@/lib/ta-sheets-write'

// One generic CRUD route for every row-based TA sheet tab (Config is excluded — see
// ta-admin-sections.ts), driven by TA_ADMIN_SECTIONS. Reuses the exact same parsers the live
// dashboard pages read with, so what the admin sees here always matches what the dashboard shows.
// Gated on canAdmin for hr-talent-acquisition, same as the rest of TA Admin.

function parseSectionRows(slug: string, rows: unknown[][]): Record<string, unknown>[] {
  switch (slug) {
    case 'hires': return parseHiresRows(rows).records as unknown as Record<string, unknown>[]
    case 'pipeline': return parsePipelineRows(rows) as unknown as Record<string, unknown>[]
    case 'internal-mobility': return parseInternalMobilityRows(rows) as unknown as Record<string, unknown>[]
    case 'conversion': return parseConversionRows(rows) as unknown as Record<string, unknown>[]
    case 'not-converted': return parseNotConvertedRows(rows) as unknown as Record<string, unknown>[]
    case 'vacancies': return parseVacancyRows(rows) as unknown as Record<string, unknown>[]
    default: return []
  }
}

// Dates come back from the parsers as real Date objects — JSON.stringify would turn them into
// full ISO timestamps (with a time-of-day component that isn't meaningful here and that a
// <input type="date"> can't consume), so they're flattened to plain "YYYY-MM-DD" first.
function serializeRecord(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v
  return out
}

function buildSheetValues(config: TaAdminSection, body: Record<string, unknown>): SheetFieldValues {
  const values: SheetFieldValues = {}
  for (const f of config.fields) {
    const raw = body[f.key]
    values[f.key] = raw == null ? '' : String(raw)
  }
  return values
}

async function fetchSectionRows(config: TaAdminSection): Promise<unknown[][]> {
  const spreadsheetId = process.env.TA_GOOGLE_SHEET_ID
  if (!spreadsheetId) throw new Error('TA_GOOGLE_SHEET_ID is not configured.')
  const accessToken = await getTaAccessToken()
  return fetchRange(spreadsheetId, config.range, accessToken)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const { section: slug } = await params
  const config = TA_ADMIN_SECTIONS[slug]
  if (!config) return NextResponse.json({ error: 'Unknown Talent Acquisition admin section.' }, { status: 404 })

  try {
    const rows = await fetchSectionRows(config)
    const records = parseSectionRows(slug, rows).map(serializeRecord)
    return NextResponse.json({ fields: config.fields, records })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load sheet data.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const { section: slug } = await params
  const config = TA_ADMIN_SECTIONS[slug]
  if (!config) return NextResponse.json({ error: 'Unknown Talent Acquisition admin section.' }, { status: 404 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  try {
    const rowNumber = await appendSheetRow(config.sheetName, buildSheetValues(config, body as Record<string, unknown>))
    return NextResponse.json({ ok: true, rowNumber })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to add the new row.' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const { section: slug } = await params
  const config = TA_ADMIN_SECTIONS[slug]
  if (!config) return NextResponse.json({ error: 'Unknown Talent Acquisition admin section.' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const rowNumber = Number((body as Record<string, unknown> | null)?.rowNumber)
  if (!body || !Number.isFinite(rowNumber) || rowNumber < 2) {
    return NextResponse.json({ error: 'Missing or invalid rowNumber — this record cannot be matched back to a sheet row.' }, { status: 400 })
  }

  try {
    await updateSheetRow(config.sheetName, rowNumber, buildSheetValues(config, body as Record<string, unknown>))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update the row.' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const { section: slug } = await params
  const config = TA_ADMIN_SECTIONS[slug]
  if (!config) return NextResponse.json({ error: 'Unknown Talent Acquisition admin section.' }, { status: 404 })

  const rowNumber = Number(req.nextUrl.searchParams.get('rowNumber'))
  if (!Number.isFinite(rowNumber) || rowNumber < 2) return NextResponse.json({ error: 'Missing or invalid rowNumber.' }, { status: 400 })

  try {
    await clearSheetRow(config.sheetName, rowNumber)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete the row.' }, { status: 500 })
  }
}
