import { MONTHS_SHORT, DAYS_IN_MONTH } from '../lib/birthday.js'

// Labeled month + day picker producing an 'MM-DD' string. Deliberately no year
// input — the year of birth is never collected. `value` may be a partial pick
// (e.g. '07-') mid-edit; run it through normalizeBirthday() before saving.
export default function BirthdayField({ label = 'Birthday', value = '', onChange, required = false }) {
  const [month = '', day = ''] = (value || '').split('-')
  const maxDay = month ? DAYS_IN_MONTH[Number(month) - 1] : 31
  const days = Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, '0'))

  function setPart(nextMonth, nextDay) {
    // Clamp the day if the newly picked month has fewer days.
    const cap = nextMonth ? DAYS_IN_MONTH[Number(nextMonth) - 1] : 31
    const d = nextDay && Number(nextDay) > cap ? String(cap).padStart(2, '0') : nextDay
    onChange(nextMonth || d ? `${nextMonth}-${d}` : '')
  }

  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1 flex gap-2">
        <select
          value={day}
          onChange={(e) => setPart(month, e.target.value)}
          className="input w-24"
          aria-label={`${label} day`}
          required={required}
        >
          <option value="">Day</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {Number(d)}
            </option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setPart(e.target.value, day)}
          className="input flex-1"
          aria-label={`${label} month`}
          required={required}
        >
          <option value="">Month</option>
          {MONTHS_SHORT.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, '0')}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </label>
  )
}
