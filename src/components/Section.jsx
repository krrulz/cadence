export default function Section({ title, onAdd, addLabel, children }) {
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-ink">{title}</h3>
        {onAdd && (
          <button type="button" onClick={onAdd} className="btn-primary text-xs">
            {addLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
