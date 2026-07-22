// Dark-theme translucent badges. Grouped by semantic colour so labels share a
// consistent language across grievances, leave, goals, SLA and attention flags.
const GREEN = 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30'
const AMBER = 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30'
const RED = 'bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-500/30'
const NEUTRAL = 'bg-white/10 text-ink-muted ring-1 ring-inset ring-white/15'

const STYLES = {
  // Grievance statuses
  Open: RED,
  'In Progress': AMBER,
  Resolved: GREEN,
  // Leave statuses
  Pending: AMBER,
  Approved: GREEN,
  Rejected: RED,
  // Grievance SLA states
  'On Track': GREEN,
  'Due Soon': AMBER,
  Overdue: RED,
  // Grievance priorities
  High: RED,
  Medium: AMBER,
  Low: NEUTRAL,
  // Goal statuses
  'Not Started': NEUTRAL,
  Completed: GREEN,
  // Attention flags
  'Low Performance': RED,
  'Grievance Open': RED,
  'Feedback Overdue': AMBER,
  'Low Leave Balance': AMBER,
  'No Data': NEUTRAL,
  OK: GREEN,
}

export default function StatusBadge({ label, className = '' }) {
  const style = STYLES[label] || NEUTRAL
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${style} ${className}`}
    >
      {label}
    </span>
  )
}
