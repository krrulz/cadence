import { useState } from 'react'
import StatusBadge from './StatusBadge.jsx'
import CommentThread from './CommentThread.jsx'
import { sortByDateDesc } from '../lib/aggregate.js'
import { grievanceSla } from '../lib/grievance.js'

// Expandable grievance cards shared by the admin detail page and the employee
// dashboard. `viewer` = { uid, name, role }. `onUpdate` (admin only) opens the
// status/priority/assignee editor in the parent; `onToggle`/`selectedIds` wire
// the cross-tab email selection on the admin side (both optional).
export default function GrievanceList({ grievances, viewer, onUpdate, selectedIds, onToggle }) {
  const [openId, setOpenId] = useState(null)
  const sorted = sortByDateDesc(grievances, 'dateRaised')
  const isAdmin = viewer.role === 'admin'

  if (sorted.length === 0) {
    return <p className="py-6 text-center text-slate-400">No grievances raised.</p>
  }

  return (
    <div className="space-y-2">
      {sorted.map((g) => {
        const sla = grievanceSla(g)
        const showSla = sla.state !== 'Resolved' && sla.state !== 'No Date'
        const open = openId === g.id
        return (
          <div key={g.id} className="rounded-md border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-2">
              {onToggle && (
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 accent-brand"
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
                  <span className="font-medium text-slate-800">{g.category}</span>
                  <StatusBadge label={g.status} />
                  {g.priority && <StatusBadge label={g.priority} />}
                  {showSla && <StatusBadge label={sla.state} />}
                </span>
                <span className="shrink-0 text-sm text-slate-400">{g.dateRaised}</span>
              </button>
            </div>

            {open && (
              <div className="space-y-4 border-t border-slate-100 p-3">
                <p className="whitespace-pre-wrap text-sm text-slate-700">{g.description}</p>

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

                {isAdmin && onUpdate && (
                  <div className="flex justify-end border-t border-slate-100 pt-2">
                    <button type="button" onClick={() => onUpdate(g)} className="btn-secondary text-xs">
                      Update status / priority
                    </button>
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
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value}</dd>
    </div>
  )
}
