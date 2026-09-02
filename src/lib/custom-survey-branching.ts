// Shared by the respondent form, the admin preview page, and the submit route's required-field
// validation — all three need to agree on exactly the same "which sections are skipped given
// these answers" logic, or a section hidden client-side could still get rejected as missing a
// required answer server-side (or vice versa). Pure function, no server-only imports, safe to use
// from a 'use client' component or a route handler.

export interface BranchingQuestion {
  id: string
  section: string | null
  gatesSection: string | null
  skipSectionIfValues: string[] | null
}

// A section is skipped if ANY of its gate questions' current answer matches one of that gate's
// own skipSectionIfValues — a survey could in principle have more than one question gating the
// same section (e.g. two different "how often" questions both able to rule it out).
export function computeSkippedSections(
  questions: BranchingQuestion[],
  answers: Record<string, string | string[] | undefined>
): Set<string> {
  const skipped = new Set<string>()
  for (const q of questions) {
    if (!q.gatesSection || !q.skipSectionIfValues || q.skipSectionIfValues.length === 0) continue
    const answer = answers[q.id]
    const answerValues = Array.isArray(answer) ? answer : answer ? [answer] : []
    if (answerValues.some((v) => q.skipSectionIfValues!.includes(v))) {
      skipped.add(q.gatesSection)
    }
  }
  return skipped
}

// Questions with no section are never skippable (gatesSection always names an actual section).
// A gate question is always shown even if it lives inside the very section it controls — e.g.
// "How often do you use Excel?" sits inside the "Microsoft Excel" section alongside the skill
// checklists it gates. Without this exception, answering "Rarely or never" would immediately mark
// "Microsoft Excel" as skipped and hide the gate question itself (the thing that just produced
// that answer), which would look like the form glitched the moment you touched it. A question
// that gates a section is never hidden by a skip rule targeting its OWN section — only by a
// DIFFERENT gate's section, which isn't a case this survey design produces today.
export function visibleQuestions<T extends BranchingQuestion>(
  questions: T[],
  answers: Record<string, string | string[] | undefined>
): T[] {
  const skipped = computeSkippedSections(questions, answers)
  return questions.filter((q) => {
    if (!q.section || !skipped.has(q.section)) return true
    return !!q.gatesSection && q.gatesSection === q.section
  })
}
