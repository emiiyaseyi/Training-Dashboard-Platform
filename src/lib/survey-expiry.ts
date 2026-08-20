import { prisma } from '@/lib/prisma'

const DAY_MS = 86400000

// Shared by the public GET (to hide the form) and the submit route (to reject a late submission)
// so the two can never disagree about whether a survey has expired.
export async function isSurveyExpired(sentAt: Date | null): Promise<boolean> {
  if (!sentAt) return false
  const settings = await prisma.surveySettings.findFirst()
  const expiryEnabled = settings?.expiryEnabled ?? true
  if (!expiryEnabled) return false
  const expiryDays = settings?.expiryDays ?? 7
  return Date.now() - sentAt.getTime() >= expiryDays * DAY_MS
}
