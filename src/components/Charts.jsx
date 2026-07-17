// Small dependency-free SVG charts for the Analytics dashboard. Colours come
// from the brand/accent palette; everything scales to its container width.

const BRAND = '#00965E'
const ACCENT = '#6B3FA0'

// Horizontal bars with a label and value per row — good for categories with
// text labels (departments, ratings, statuses).
export function BarChart({ data, color = BRAND, valueSuffix = '' }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (data.every((d) => d.value === 0)) {
    return <p className="py-6 text-center text-sm text-slate-400">No data yet.</p>
  }
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 truncate text-slate-600" title={d.label}>
            {d.label}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className="flex h-full items-center justify-end rounded pr-1.5 text-[11px] font-medium text-white"
              style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 8 : 0)}%`, backgroundColor: color }}
            >
              {d.value > 0 ? `${d.value}${valueSuffix}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Grouped two-series horizontal bars, e.g. leave taken vs entitled per type.
export function GroupedBarChart({ data, seriesA, seriesB }) {
  const max = Math.max(1, ...data.flatMap((d) => [d[seriesA.key], d[seriesB.key]]))
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs text-slate-500">
        <Legend color={seriesA.color || BRAND} label={seriesA.label} />
        <Legend color={seriesB.color || ACCENT} label={seriesB.label} />
      </div>
      {data.map((d) => (
        <div key={d.label} className="text-sm">
          <div className="mb-1 flex justify-between text-slate-600">
            <span>{d.label}</span>
            <span className="text-slate-400">
              {d[seriesA.key]} / {d[seriesB.key]}
            </span>
          </div>
          <div className="space-y-1">
            <Bar value={d[seriesA.key]} max={max} color={seriesA.color || BRAND} />
            <Bar value={d[seriesB.key]} max={max} color={seriesB.color || ACCENT} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Bar({ value, max, color }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded bg-slate-100">
      <div className="h-full rounded" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

// Vertical column chart for time series (recognitions per month).
export function ColumnChart({ data, color = ACCENT }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex h-40 items-end justify-between gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-medium text-slate-500">{d.value || ''}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t"
              style={{ height: `${(d.value / max) * 100}%`, backgroundColor: color, minHeight: d.value > 0 ? 4 : 0 }}
            />
          </div>
          <span className="text-xs text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// Donut chart with a centre total and a legend. `data` = [{label, value}].
export function DonutChart({ data, colors = [BRAND, '#F59E0B', ACCENT, '#EF4444', '#0EA5E9'] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const radius = 60
  const stroke = 24
  const circ = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0">
        <g transform="rotate(-90 80 80)">
          {total === 0 ? (
            <circle cx="80" cy="80" r={radius} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
          ) : (
            data.map((d, i) => {
              const len = (d.value / total) * circ
              const seg = (
                <circle
                  key={d.label}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={colors[i % colors.length]}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${circ - len}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += len
              return seg
            })
          )}
        </g>
        <text x="80" y="76" textAnchor="middle" className="fill-slate-800 text-2xl font-semibold">
          {total}
        </text>
        <text x="80" y="96" textAnchor="middle" className="fill-slate-400 text-xs">
          total
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="font-medium text-slate-800">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
