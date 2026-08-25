import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mailer'
import { computeBUReportComparison } from '@/lib/bu-report-comparison'
import { buildBUReportPptxBuffer } from '@/lib/bu-report-pptx'
import { buildBUReportHtml } from '@/lib/bu-report-html'
import { renderHtmlToPdfBuffer } from '@/lib/bu-report-pdf'
import { buildBUReportEmail } from '@/lib/bu-report-email'

export interface BUReportSendSummary {
  period: string
  businessUnitsProcessed: number
  sent: number
  failed: number
  errors: { businessUnit: string; recipient?: string; message: string }[]
}

// The report always covers the last FULLY CLOSED month relative to "now" — run this any day in
// September and it reports on August, never the still-in-progress current month.
function lastClosedMonth(now: Date): { year: number; monthIdx: number } {
  const monthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  return { year, monthIdx }
}

export async function sendBUReports(now: Date = new Date()): Promise<BUReportSendSummary> {
  const { year, monthIdx } = lastClosedMonth(now)
  const period = new Date(year, monthIdx, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })

  const recipients = await prisma.bUReportRecipient.findMany({ where: { active: true } })
  const byBU = new Map<string, typeof recipients>()
  for (const r of recipients) {
    if (!byBU.has(r.businessUnit)) byBU.set(r.businessUnit, [])
    byBU.get(r.businessUnit)!.push(r)
  }

  let sent = 0
  let failed = 0
  const errors: BUReportSendSummary['errors'] = []

  for (const [businessUnit, buRecipients] of byBU) {
    let pptxBuffer: Buffer, pdfBuffer: Buffer
    let comparison: Awaited<ReturnType<typeof computeBUReportComparison>> | undefined
    try {
      comparison = await computeBUReportComparison(businessUnit, year, monthIdx)
      ;[pptxBuffer, pdfBuffer] = await Promise.all([
        buildBUReportPptxBuffer(businessUnit, comparison),
        renderHtmlToPdfBuffer(buildBUReportHtml(businessUnit, comparison)),
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to build the report.'
      failed += buRecipients.length
      for (const r of buRecipients) {
        errors.push({ businessUnit, recipient: r.email, message })
        await prisma.bUReportSendLog.create({
          data: { businessUnit, recipientEmail: r.email, recipientName: r.name, period, isQuarterly: !!comparison?.quarterly, success: false, errorMessage: message },
        }).catch(() => {})
      }
      continue
    }

    for (const r of buRecipients) {
      const loginHint = r.staffId || r.email
      try {
        const { subject, html } = buildBUReportEmail({ businessUnit, recipientName: r.name, loginHint, comparison })
        await sendMail({
          to: r.email,
          subject,
          html,
          attachments: [
            { filename: `${businessUnit} - ${period}.pdf`, content: pdfBuffer },
            { filename: `${businessUnit} - ${period}.pptx`, content: pptxBuffer },
          ],
        })
        sent++
        await prisma.bUReportSendLog.create({
          data: { businessUnit, recipientEmail: r.email, recipientName: r.name, period, isQuarterly: !!comparison.quarterly, success: true },
        })
      } catch (err) {
        failed++
        const message = err instanceof Error ? err.message : 'Failed to send.'
        errors.push({ businessUnit, recipient: r.email, message })
        await prisma.bUReportSendLog.create({
          data: { businessUnit, recipientEmail: r.email, recipientName: r.name, period, isQuarterly: !!comparison.quarterly, success: false, errorMessage: message },
        }).catch(() => {})
      }
    }
  }

  return { period, businessUnitsProcessed: byBU.size, sent, failed, errors }
}
