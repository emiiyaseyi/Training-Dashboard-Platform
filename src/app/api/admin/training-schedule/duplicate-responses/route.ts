import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { findDuplicateResponseGroups } from '@/lib/duplicate-responses'

// Finds every group of 2+ SurveyResponses for the same person, same training, same stage —
// whichever schedule they're attached to, native submission or a "Legacy" import alike — for an
// admin to review and choose which to remove. Detection-only; nothing here deletes anything (see
// [responseId]/route.ts for a single removal, or bulk-delete-older/route.ts for removing every
// older duplicate in every group at once).
export async function GET() {
  const gate = await requirePermission('admin-settings', 'view')
  if (gate instanceof NextResponse) return gate

  const duplicateGroups = await findDuplicateResponseGroups()
  return NextResponse.json({ groups: duplicateGroups, groupCount: duplicateGroups.length })
}
