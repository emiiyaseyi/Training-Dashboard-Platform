import type { BUDetailAnalytics } from './analytics'
import { exportExcel, nairaNum } from './export'

export async function exportBUToExcel(buName: string, detail: BUDetailAnalytics) {
  await exportExcel(
    [
      {
        name: 'Monthly Training Spend',
        rows: detail.monthlyTrainingSpend.map((m) => ({
          Month: m.month,
          'Cost (₦)': nairaNum(m.cost),
        })),
      },
      {
        name: 'Top Training Programmes',
        rows: detail.topTrainings.map((t) => ({
          Programme: t.training,
          Participants: t.count,
          'Total Cost (₦)': nairaNum(t.totalCost),
          'Avg Cost per Participant (₦)': nairaNum(t.totalCost / t.count),
        })),
      },
      {
        name: 'Application Rates',
        rows: detail.feedbackSummary.applicationRates.map((a) => ({
          Category: a.category,
          Count: a.count,
        })),
      },
      {
        name: 'Membership Organisations',
        rows: detail.subscriptionBreakdown.map((s) => ({
          Organisation: s.org,
          Members: s.count,
          'Total Amount (₦)': nairaNum(s.totalAmount),
          'Avg Cost (₦)': nairaNum(s.totalAmount / s.count),
        })),
      },
      {
        name: 'Training Programmes',
        rows: detail.topTrainings.map((t) => ({
          Programme: t.training,
          Participants: t.count,
          'Total Cost (₦)': nairaNum(t.totalCost),
        })),
      },
      {
        name: 'Impact Alignment Areas',
        rows: detail.feedbackSummary.impactAreas.map((a) => ({
          'Impact Area': a.area,
          Responses: a.count,
        })),
      },
    ],
    `${buName.replace(/\s+/g, '_')}_BU_Report`,
  )
}
