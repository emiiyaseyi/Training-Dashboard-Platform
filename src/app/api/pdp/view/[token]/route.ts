import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rateLimit } from '@/lib/rate-limit'
import { resolveRespondentSections } from '@/lib/pdp-form'
import type { PDPFormAnswers } from '@/lib/pdp-validate'

// Public, read-only — looks up by whichever model's viewToken matches (a staff member's own
// PDPStaffSurvey, finalized via the Track A validate flow, or a PDPManagerTeamMemberEntry,
// finalized via the consolidated Track B-style flow). Never the editable surveyToken — this is
// the link sent once the manager's piece is done, not an invitation to fill/edit anything.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(req, 'pdp-view-get', 60, 60_000)
  if (limited) return limited

  try {
    const { token } = await params

    const staffSurvey = await prisma.pDPStaffSurvey.findUnique({
      where: { viewToken: token },
      include: { cycle: true, validations: true },
    })
    if (staffSurvey) {
      const completed = staffSurvey.validations.find((v) => v.respondedAt && v.editedAnswers)
      const answers = completed ? (JSON.parse(completed.editedAnswers!) as PDPFormAnswers) : (staffSurvey.answers ? (JSON.parse(staffSurvey.answers) as PDPFormAnswers) : null)
      if (!answers) return NextResponse.json({ error: 'This plan has not been finalized yet.' }, { status: 404 })
      const sections = await resolveRespondentSections(staffSurvey.cycleId)
      return NextResponse.json({
        valid: true,
        cycleTitle: staffSurvey.cycle.title,
        staffName: staffSurvey.staffName,
        managerName: completed?.managerName ?? null,
        sections,
        answers,
      })
    }

    const entry = await prisma.pDPManagerTeamMemberEntry.findUnique({
      where: { viewToken: token },
      include: { managerSurvey: { include: { cycle: true } } },
    })
    if (entry) {
      if (!entry.submittedAt || !entry.answers) return NextResponse.json({ error: 'This plan has not been finalized yet.' }, { status: 404 })
      const sections = await resolveRespondentSections(entry.managerSurvey.cycleId)
      return NextResponse.json({
        valid: true,
        cycleTitle: entry.managerSurvey.cycle.title,
        staffName: entry.staffName,
        managerName: entry.managerSurvey.managerName,
        sections,
        answers: JSON.parse(entry.answers) as PDPFormAnswers,
      })
    }

    return NextResponse.json({ error: 'This link is invalid.' }, { status: 404 })
  } catch (err) {
    console.error('[pdp/view GET]', err)
    return NextResponse.json({ error: 'Something went wrong loading this plan.' }, { status: 500 })
  }
}
