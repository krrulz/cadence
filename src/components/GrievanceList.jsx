import { useState } from 'react'
import StatusBadge from './StatusBadge.jsx'
import CommentThread from './CommentThread.jsx'
import { sortByDateDesc } from '../lib/aggregate.js'
import { grievanceSla } from '../lib/grievance.js'

// SLA tracking is shown as a colour-coded dot so the status tag stays
// unambiguous (the tag is the status; the colour is the schedule health).
const SLA_DOT = {
  'On Track': { color: 'bg-green-500', label: 'On track' },
  'Due Soon': { color: 'bg-amber-500/100', label: 'Due soon' },
  Overdue: { color: 'bg-red-500', label: 'Overdue' },
}

// Expandable grievance cards shared by the admin detail page and the employee
// dashboard. `viewer` = { uid, name, role }. `onUpdate` (admin only) opens the
// status/priority/assignee editor in the parent; `onToggle`/`selectedIds` wire
// the cross-tab email selection on the admin side (both optional).
export default function GrievanceList({ grievances, viewer, onUpdate, onEdit, onDelete, selectedIds, onToggle }) {
  const [openId, setOpenId] = useState(null)
  const sorted = sortByDateDesc(grievances, 'dateRaised')
  const isAdmin = viewer.role === 'admin'

  if (sorted.length === 0) {
    return <p className="py-6 text-center text-ink-faint">No grievances raised.</p>
  }

  return (
    <div className="space-y-2">
      {sorted.map((g) => {
        const sla = grievanceSla(g)
        const showSla = sla.state !== 'Resolved' && sla.state !== 'No Date'
        const dot = SLA_DOT[sla.state]
        const open = openId === g.id
        return (
          <div key={g.id} className="rounded-md border border-surface-border">
            <div className="flex items-center gap-2 px-3 py-2">
              {onToggle && (
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-mint"
                  checked={!!selectedIds?.has(g.id)}
                  onChange={() => onToggle(g)}
                  aria-label="Select grievance"
                />
              )}
              <button
                type="button"
                onClick={() => setOpenId(open ? null : g.id)}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  {showSla && dot && (
                    <span
                      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot.color}`}
                      title={`SLA: ${dot.label}${sla.dueDate ? ` (target ${sla.dueDate})` : ''}`}
                      aria-label={`SLA ${dot.label}`}
                    />
                  )}
                  <span className="font-medium text-ink">{g.category}</span>
                  <StatusBadge label={g.status} />
                </span>
                <span className="shrink-0 text-sm text-ink-faint">{g.dateRaised}</span>
              </button>
            </div>

            {open && (
              <div className="space-y-4 border-t border-white/5 p-3">
                <p className="whitespace-pre-wrap text-sm text-ink">{g.description}</p>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                  <Field label="Priority" value={g.priority || '—'} />
                  <Field label="Assignee" value={g.assignee || 'Unassigned'} />
                  <Field label="Target date" value={showSla ? sla.dueDate : '—'} />
                  {g.status === 'Resolved' && (
                    <>
                      <Field label="Resolved" value={g.resolutionDate || '—'} />
                      <Field label="Resolved by" value={g.resolvedBy || '—'} />
                    </>
                  )}
                  {showSla && sla.state === 'Overdue' && (
                    <Field label="Overdue by" value={`${Math.abs(sla.daysLeft)} day${Math.abs(sla.daysLeft) === 1 ? '' : 's'}`} />
                  )}
                </dl>

                <CommentThread parentCollection="grievances" parentId={g.id} viewer={viewer} />

                {(onUpdate || onEdit || onDelete) && (
                  <div className="flex flex-wrap justify-end gap-3 border-t border-white/5 pt-2">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(g)}
                        className="text-xs text-ink-muted hover:text-mint hover:underline"
                      >
                        Edit details
                      </button>
                    )}
                    {isAdmin && onUpdate && (
                      <button type="button" onClick={() => onUpdate(g)} className="btn-secondary text-xs">
                        Update status / priority
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(g)}
                        className="text-xs text-ink-faint hover:text-rose-400 hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}
