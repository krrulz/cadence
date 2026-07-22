import { sortByDateDesc } from '../lib/aggregate.js'

export default function PerformanceTimeline({
  records,
  emptyText = 'Nothing logged yet.',
  selectable = false,
  selectedIds,
  onToggle,
  onEditAchievement,
  onDelete,
  canDelete,
}) {
  const sorted = sortByDateDesc(records, 'date')

  if (sorted.length === 0) {
    return <p className="py-6 text-center text-ink-faint">{emptyText}</p>
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
          onEditAchievement={onEditAchievement}
          onDelete={onDelete}
          canDelete={canDelete}
        />
      ))}
    </div>
  )
}

function PerformanceEntry({ record, selectable, selected, onToggle, onEditAchievement, onDelete, canDelete }) {
  const isAchievement = record.entryType === 'Achievement'
  const showEdit = isAchievement && onEditAchievement
  const showDelete = onDelete && (canDelete ? canDelete(record) : false)

  return (
    <div className="flex gap-3 rounded-md border border-surface-border p-3">
      {selectable && (
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-mint"
          checked={!!selected}
          onChange={() => onToggle?.(record)}
          aria-label={`Select ${isAchievement ? record.title : record.reviewPeriod}`}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isAchievement ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent-200">
                🏆 Achievement
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-ink-muted">
                Review
              </span>
            )}
            <span className="text-sm text-ink-muted">{record.date}</span>
          </div>
          <div className="flex items-center gap-3">
            {!isAchievement && record.rating != null && (
              <span className="text-sm font-semibold text-mint">Rating: {record.rating}/5</span>
            )}
            {showEdit && (
              <button
                type="button"
                onClick={() => onEditAchievement(record)}
                className="text-xs text-ink-muted hover:text-mint hover:underline"
              >
                Edit
              </button>
            )}
            {showDelete && (
              <button
                type="button"
                onClick={() => onDelete(record)}
                className="text-xs text-ink-faint hover:text-rose-400 hover:underline"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {isAchievement ? (
          <>
            <p className="mt-2 font-medium text-ink">{record.title}</p>
            {record.description && <p className="text-sm text-ink-muted">{record.description}</p>}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium text-ink">
              {record.reviewPeriod}
              {record.reviewer && ` · Reviewer: ${record.reviewer}`}
            </p>
            {record.comments && <p className="mt-1 text-sm text-ink-muted">{record.comments}</p>}
            {record.goals && <p className="mt-1 text-sm text-ink-muted">Goals: {record.goals}</p>}
          </>
        )}
      </div>
    </div>
  )
}
