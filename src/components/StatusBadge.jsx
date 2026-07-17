const STYLES = {
  // Grievance statuses
  Open: 'bg-red-100 text-red-800',
  'In Progress': 'bg-amber-100 text-amber-800',
  Resolved: 'bg-green-100 text-green-800',
  // Leave statuses
  Pending: 'bg-amber-100 text-amber-800',
  Approved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
  // Goal statuses ('In Progress' shared with grievances above)
  'Not Started': 'bg-slate-200 text-slate-700',
  'At Risk': 'bg-red-100 text-red-800',
  Completed: 'bg-green-100 text-green-800',
  // Attention flags
  'Low Performance': 'bg-red-100 text-red-800',
  'Grievance Open': 'bg-red-100 text-red-800',
  'Feedback Overdue': 'bg-amber-100 text-amber-800',
  'Low Leave Balance': 'bg-amber-100 text-amber-800',
  'No Data': 'bg-slate-200 text-slate-700',
  OK: 'bg-green-100 text-green-800',
}

export default function StatusBadge({ label, className = '' }) {
  const style = STYLES[label] || 'bg-slate-200 text-slate-700'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style} ${className}`}
    >
      {label}
    </span>
  )
}
