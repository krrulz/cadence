import { sortByDateDesc } from '../lib/aggregate.js'

export default function PerformanceTimeline({
  records,
  emptyText = 'Nothing logged yet.',
  selectable = false,
  selectedIds,
  onToggle,
}) {
  const sorted = sortByDateDesc(records, 'date')

  if (sorted.length === 0) {
    return <p className="py-6 text-center text-slate-400">{emptyText}</p>
  }

  return (
    <div className="space-y-3">
      {sorted.map((r) => (
        <PerformanceEntry
          key={r.id}
          record={r}
          selectable={selectable}
          selected={selectedIds?.has(r.id)}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

function PerformanceEntry({ record, selectable, selected, onToggle }) {
  const isAchievement = record.entryType === 'Achievement'

  return (
    <div className="flex gap-3 rounded-md border border-slate-200 p-3">
      {selectable && (
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-brand"
          checked={!!selected}
          onChange={() => onToggle?.(record)}
          aria-label={`Select ${isAchievement ? record.title : record.reviewPeriod}`}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isAchievement ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-xs font-medium text-accent-700">
                🏆 Achievement
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                Review
              </span>
            )}
            <span className="text-sm text-slate-500">{record.date}</span>
          </div>
          {!isAchievement && record.rating != null && (
            <span className="text-sm font-semibold text-brand">Rating: {record.rating}/5</span>
          )}
        </div>

        {isAchievement ? (
          <>
            <p className="mt-2 font-medium text-slate-800">{record.title}</p>
            {record.description && <p className="text-sm text-slate-600">{record.description}</p>}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium text-slate-700">
              {record.reviewPeriod}
              {record.reviewer && ` · Reviewer: ${record.reviewer}`}
            </p>
            {record.comments && <p className="mt-1 text-sm text-slate-600">{record.comments}</p>}
            {record.goals && <p className="mt-1 text-sm text-slate-500">Goals: {record.goals}</p>}
          </>
        )}
      </div>
    </div>
  )
}
