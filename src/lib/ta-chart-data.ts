// Talent Acquisition — ported from github.com/emiiyaseyi/Talent-Recruitment-Dashboard
// (lib/chartData.ts), unchanged. Folds long-tail categories into "Other" so charts never exceed
// a legible series count.

export function topNWithOther<T extends { key: string; count: number }>(items: T[], n = 8): { key: string; count: number }[] {
  if (items.length <= n) return items
  const head = items.slice(0, n)
  const tail = items.slice(n)
  const otherCount = tail.reduce((sum, item) => sum + item.count, 0)
  return [...head, { key: 'Other', count: otherCount }]
}
