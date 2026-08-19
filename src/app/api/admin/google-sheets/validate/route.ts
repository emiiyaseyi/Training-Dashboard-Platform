import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/session-guard'
import { connectToSpreadsheet, fetchSheetHeaderRow, findMissingColumns } from '@/lib/google-sheets'

type SheetType = 'training' | 'feedback' | 'subscription' | 'kss'

interface ValidateInput {
  spreadsheetUrl: string
  trainingSheetName: string
  feedbackSheetName: string
  subscriptionSheetName: string
  kssSheetName: string
}

export async function POST(req: NextRequest) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const input = (await req.json()) as ValidateInput
  const errors: { sheet: string; message: string }[] = []
  let spreadsheetTitle = ''
  let tabTitles: string[] = []

  const sheetChecks: { type: SheetType; label: string; name: string }[] = [
    { type: 'training', label: 'Training Cost', name: input.trainingSheetName },
    { type: 'feedback', label: 'Feedback', name: input.feedbackSheetName },
    { type: 'subscription', label: 'Subscriptions', name: input.subscriptionSheetName },
    { type: 'kss', label: 'KSS', name: input.kssSheetName },
  ]

  try {
    const connection = await connectToSpreadsheet(input.spreadsheetUrl)
    spreadsheetTitle = connection.spreadsheetTitle
    tabTitles = connection.tabTitles

    for (const check of sheetChecks) {
      if (!check.name?.trim()) {
        errors.push({ sheet: check.label, message: 'No tab name configured.' })
        continue
      }
      if (!tabTitles.includes(check.name.trim())) {
        errors.push({
          sheet: check.label,
          message: `Tab "${check.name}" not found. Tabs in this spreadsheet: ${tabTitles.join(', ') || '(none)'}.`,
        })
        continue
      }
      try {
        const headers = await fetchSheetHeaderRow(connection.spreadsheetId, check.name.trim(), connection.accessToken)
        const missing = findMissingColumns(headers, check.type)
        for (const m of missing) {
          errors.push({ sheet: check.label, message: m })
        }
      } catch (err) {
        errors.push({ sheet: check.label, message: err instanceof Error ? err.message : 'Failed to read tab headers.' })
      }
    }
  } catch (err) {
    errors.push({ sheet: 'Connection', message: err instanceof Error ? err.message : 'Failed to connect to Google Sheets.' })
  }

  const success = errors.length === 0 && tabTitles.length > 0

  // Persist the outcome so the admin panel shows last-checked status after a page reload.
  const existing = await prisma.googleSheetsConfig.findFirst()
  const statusData = {
    lastSyncedAt: new Date(),
    lastSyncStatus: success ? 'success' : 'error',
    lastSyncErrors: JSON.stringify(errors),
  }
  if (existing) {
    await prisma.googleSheetsConfig.update({ where: { id: existing.id }, data: statusData })
  }

  return NextResponse.json({ success, spreadsheetTitle, tabTitles, errors })
}
