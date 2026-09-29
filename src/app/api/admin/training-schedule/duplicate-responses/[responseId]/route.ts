import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { deleteResponseEntry } from '@/lib/duplicate-responses'

// Removes ONE side of a duplicate an admin reviewed in the Duplicate Survey Responses panel and
// chose to discard — see deleteResponseEntry (lib/duplicate-responses.ts) for exactly what that
// does and why.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ responseId: string }> }) {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const { responseId } = await params
  await deleteResponseEntry(responseId)
  return NextResponse.json({ success: true })
}
