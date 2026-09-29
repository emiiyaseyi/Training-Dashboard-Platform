import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { findDuplicateResponseGroups, deleteResponseEntry } from '@/lib/duplicate-responses'

export const maxDuration = 60

// One click to resolve every duplicate group the same way: keep the most recently submitted
// response, delete the rest. Built for exactly the common case seen in practice — a batch of
// legacy-imported reviews where every duplicate group is "two entries, seconds apart, same
// answers" — rather than making an admin click through each one individually. A group that
// genuinely needs a case-by-case look is still available in the regular (non-bulk) review list.
export async function POST() {
  const gate = await requirePermission('admin-settings', 'admin')
  if (gate instanceof NextResponse) return gate

  const groups = await findDuplicateResponseGroups()
  let groupsResolved = 0
  let entriesRemoved = 0

  for (const entries of groups) {
    // findDuplicateResponseGroups already sorts each group newest-first.
    const [, ...older] = entries
    for (const entry of older) {
      await deleteResponseEntry(entry.responseId)
      entriesRemoved++
    }
    groupsResolved++
  }

  return NextResponse.json({ groupsResolved, entriesRemoved })
}
