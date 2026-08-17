export function fmt(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`
  return `₦${n.toLocaleString()}`
}
export function pct(n: number) { return `${n.toFixed(1)}%` }
export function rating(n: number) { return `${n.toFixed(1)}/5` }
