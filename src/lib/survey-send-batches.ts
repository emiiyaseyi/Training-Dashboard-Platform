// Client-side helper: sends a survey stage to a list of attendees in small chunks instead of one
// giant request. The mailer itself is serial (one pooled SMTP connection — see survey-send.ts), so
// a schedule with a large participant list can take minutes to fully send; a single fetch for
// "everyone" either hangs the admin's UI behind one long spinner or, past Vercel's 60s function
// limit, gets killed mid-send with no way to tell how far it got. Chunking keeps each request well
// under that limit and lets the caller show real progress between batches.
const SEND_BATCH_SIZE = 15

export interface BatchSendResult {
  sent: number
  skipped: { staffName: string; reason: string }[]
}

export async function sendStageInBatches(
  scheduleId: string,
  stage: 'pre' | 'post1' | 'post2',
  attendeeIds: string[],
  options: { skipDefaultCc?: boolean; skipLineManagerCc?: boolean } = {},
  onProgress?: (sentSoFar: number, total: number) => void
): Promise<BatchSendResult> {
  const result: BatchSendResult = { sent: 0, skipped: [] }

  for (let i = 0; i < attendeeIds.length; i += SEND_BATCH_SIZE) {
    const batch = attendeeIds.slice(i, i + SEND_BATCH_SIZE)
    const data = await fetch(`/api/admin/training-schedule/${scheduleId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, attendeeIds: batch, skipDefaultCc: options.skipDefaultCc, skipLineManagerCc: options.skipLineManagerCc }),
    })
      .then((res) => res.json())
      .catch(() => null)

    if (data) {
      result.sent += data.sent ?? 0
      if (Array.isArray(data.skipped)) result.skipped.push(...data.skipped)
    }
    onProgress?.(Math.min(i + batch.length, attendeeIds.length), attendeeIds.length)
  }

  return result
}
