// Shared by the ES/PM/TM dummy unit pages for metric categories that have no data source
// anywhere in this app yet — shows an honest "—" per line rather than an invented number, so a
// missing feed is visibly missing instead of silently backed by a guess.
export function MetricListCard({ title, metrics }: { title: string; metrics: string[] }) {
  return (
    <div className="bg-white border border-meristem-100 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-slate-800">{title}</p>
        <span className="text-[9px] font-bold uppercase tracking-wide text-rose-600 bg-rose-50 rounded-full px-2 py-0.5">no data source yet</span>
      </div>
      <div className="space-y-2">
        {metrics.map((m) => (
          <div key={m} className="flex items-center justify-between text-[12px]">
            <span className="text-slate-500">{m}</span>
            <span className="font-semibold text-slate-300">—</span>
          </div>
        ))}
      </div>
    </div>
  )
}
