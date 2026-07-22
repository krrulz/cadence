export default function StatCard({ label, value, hint }) {
  return (
    <div className="card">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className="gradient-text mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}
