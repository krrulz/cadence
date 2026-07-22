// `records` is optional and only needed when the table is selectable — rows stay
// the plain cell arrays callers already pass, and records[i] is the source doc
// behind rows[i], so selection can report a real id back to the caller.
export default function DataTable({
  headers,
  rows,
  emptyText,
  selectable = false,
  records,
  selectedIds,
  onToggle,
  rowActions,
}) {
  const colCount = headers.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
            {selectable && <th className="py-2 pr-2"></th>}
            {headers.map((h) => (
              <th key={h} className="py-2 pr-4">
                {h}
              </th>
            ))}
            {rowActions && <th className="py-2 pr-4"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={records?.[i]?.id ?? i} className="border-b border-white/5 hover:bg-white/[0.03]">
              {selectable && (
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-mint"
                    checked={!!selectedIds?.has(records?.[i]?.id)}
                    onChange={() => records?.[i] && onToggle?.(records[i])}
                    aria-label="Select row"
                  />
                </td>
              )}
              {row.map((cell, j) => (
                <td key={j} className="max-w-xs truncate py-2 pr-4 text-ink-muted" title={String(cell ?? '')}>
                  {cell ?? '—'}
                </td>
              ))}
              {rowActions && (
                <td className="whitespace-nowrap py-2 pr-4">{records?.[i] && rowActions(records[i])}</td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={colCount} className="py-6 text-center text-ink-faint">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
