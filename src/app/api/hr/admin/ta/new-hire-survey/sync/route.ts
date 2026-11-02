import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/session-guard'
import { syncNewHireExperienceSurveys, sendDueNewHireExperienceSurveys } from '@/lib/new-hire-survey'

// Pulls newly-accepted hires from the TA Hires sheet, matches them to the staff roster, creates
// their NewHireExperienceSurvey row (scheduled 7 days post join date), then immediately sends any
// row already due — so a TA admin clicking "Sync" doesn't have to wait for the next cron tick to
// see an overdue one go out.
export async function POST() {
  const gate = await requirePermission('hr-talent-acquisition', 'admin')
  if (gate instanceof NextResponse) return gate

  const syncResult = await syncNewHireExperienceSurveys()
  const sendResult = await sendDueNewHireExperienceSurveys()
  return NextResponse.json({ syncResult, sendResult })
}
