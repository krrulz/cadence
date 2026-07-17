import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  getAllRecords,
  getAllUsers,
  getRecordsForEmployee,
  addRecord,
  deleteRecord,
} from '../lib/firestoreHelpers.js'
import { LabeledInput } from '../components/FormFields.jsx'
import {
  WEEKDAY_LABELS,
  monthMatrix,
  monthLabel,
  indexLeavesByDate,
  toISO,
  isSameMonth,
  isToday,
  isWeekend,
} from '../lib/calendar.js'

// Deterministic pill color per person, drawn from the two brand ramps so the
// calendar stays on-palette no matter who's off. Same uid always maps to the
// same swatch across renders and sessions.
const SWATCHES = [
  'bg-brand-100 text-brand-800',
  'bg-accent-100 text-accent-800',
  'bg-brand-200 text-brand-900',
  'bg-accent-200 text-accent-900',
  'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
  'bg-fuchsia-100 text-fuchsia-800',
]
function swatchFor(key) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return SWATCHES[hash % SWATCHES.length]
}

export default function PtoCalendar() {
  const { user, profile, isAdmin } = useAuth()
  const [loading, setLoading] = useState(true)
  const [leaves, setLeaves] = useState([])
  const [holidays, setHolidays] = useState([])
  const [namesByUid, setNamesByUid] = useState({})
  const [includePending, setIncludePending] = useState(false)

  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })

  const loadData = useCallback(async () => {
    setLoading(true)
    if (isAdmin) {
      const [allLeaves, users, hols] = await Promise.all([
        getAllRecords('leaves'),
        getAllUsers(),
        getAllRecords('holidays'),
      ])
      setLeaves(allLeaves)
      setNamesByUid(Object.fromEntries(users.map((u) => [u.id, u.name])))
      setHolidays(hols)
    } else {
      const [own, hols] = await Promise.all([getRecordsForEmployee('leaves', user.uid), getAllRecords('holidays')])
      setLeaves(own)
      setNamesByUid({ [user.uid]: profile?.name || 'You' })
      setHolidays(hols)
    }
    setLoading(false)
  }, [isAdmin, user.uid, profile?.name])

  useEffect(() => {
    loadData()
  }, [loadData])

  const shown = useMemo(
    () => leaves.filter((l) => l.status === 'Approved' || (includePending && l.status === 'Pending')),
    [leaves, includePending],
  )
  const byDate = useMemo(() => indexLeavesByDate(shown), [shown])
  const holidayByDate = useMemo(() => Object.fromEntries(holidays.map((h) => [h.date, h.name])), [holidays])
  const weeks = useMemo(() => monthMatrix(view.year, view.month), [view])

  function step(delta) {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }
  function goToday() {
    const t = new Date()
    setView({ year: t.getFullYear(), month: t.getMonth() })
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Leave Calendar</h1>
          <p className="text-sm text-slate-500">
            {isAdmin ? "Who's off across the team." : "Your approved and requested leave."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={includePending}
            onChange={(e) => setIncludePending(e.target.checked)}
          />
          Include pending
        </label>
      </div>

      <div className="mt-4 card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-accent">{monthLabel(view.year, view.month)}</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => step(-1)} className="btn-secondary text-xs" aria-label="Previous month">
              ← Prev
            </button>
            <button type="button" onClick={goToday} className="btn-secondary text-xs">
              Today
            </button>
            <button type="button" onClick={() => step(1)} className="btn-secondary text-xs" aria-label="Next month">
              Next →
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingSpinner label="Loading leave…" />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                {WEEKDAY_LABELS.map((d) => (
                  <div key={d} className="px-2 py-2">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {weeks.flat().map((date) => {
                  const iso = toISO(date)
                  const inMonth = isSameMonth(date, view.year, view.month)
                  const dayLeaves = byDate[iso] || []
                  return (
                    <DayCell
                      key={iso}
                      date={date}
                      iso={iso}
                      inMonth={inMonth}
                      dayLeaves={dayLeaves}
                      holidayName={holidayByDate[iso]}
                      namesByUid={namesByUid}
                      isAdmin={isAdmin}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <HolidayManager holidays={holidays} onChanged={loadData} />
      )}
    </Layout>
  )
}

function HolidayManager({ holidays, onChanged }) {
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const sorted = useMemo(() => [...holidays].sort((a, b) => a.date.localeCompare(b.date)), [holidays])

  async function addHoliday(e) {
    e.preventDefault()
    if (!date || !name.trim()) return
    setSubmitting(true)
    await addRecord('holidays', { date, name: name.trim() })
    setDate('')
    setName('')
    setSubmitting(false)
    onChanged()
  }

  async function removeHoliday(id) {
    await deleteRecord('holidays', id)
    onChanged()
  }

  return (
    <div className="mt-6 card">
      <h2 className="mb-1 font-semibold text-accent">Public holidays</h2>
      <p className="mb-4 text-sm text-slate-500">
        Holidays are highlighted on the calendar and excluded from leave-day counts.
      </p>

      <form onSubmit={addHoliday} className="mb-4 flex flex-wrap items-end gap-3">
        <LabeledInput label="Date" type="date" required value={date} onChange={setDate} />
        <div className="flex-1">
          <LabeledInput label="Name" required value={name} onChange={setName} placeholder="e.g. National Day" />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Adding…' : 'Add holiday'}
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400">No holidays added yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sorted.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-medium text-slate-700">{h.date}</span>
                <span className="ml-3 text-slate-600">{h.name}</span>
              </span>
              <button
                type="button"
                onClick={() => removeHoliday(h.id)}
                className="text-slate-400 hover:text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DayCell({ date, iso, inMonth, dayLeaves, holidayName, namesByUid, isAdmin }) {
  const MAX = 3
  const visible = dayLeaves.slice(0, MAX)
  const extra = dayLeaves.length - visible.length

  return (
    <div
      className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 ${
        holidayName && inMonth
          ? 'bg-amber-50'
          : inMonth
            ? isWeekend(date)
              ? 'bg-slate-50/60'
              : 'bg-white'
            : 'bg-slate-50/40 text-slate-300'
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
            isToday(date) ? 'bg-brand font-semibold text-white' : inMonth ? 'text-slate-600' : 'text-slate-300'
          }`}
        >
          {date.getDate()}
        </span>
      </div>
      {holidayName && inMonth && (
        <div className="mb-1 truncate rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800" title={holidayName}>
          {holidayName}
        </div>
      )}
      <div className="space-y-1">
        {visible.map((leave) => {
          // Admin cares who's off; employee cares which leave type.
          const label = isAdmin ? namesByUid[leave.employeeId] || 'Unknown' : leave.leaveType
          const pending = leave.status === 'Pending'
          return (
            <div
              key={leave.id}
              title={`${namesByUid[leave.employeeId] || 'Unknown'} — ${leave.leaveType}${pending ? ' (pending)' : ''}`}
              className={`truncate rounded px-1.5 py-0.5 text-[11px] leading-tight ${swatchFor(leave.employeeId)} ${
                pending ? 'opacity-60 ring-1 ring-inset ring-slate-300' : ''
              }`}
            >
              {label}
            </div>
          )
        })}
        {extra > 0 && <div className="px-1.5 text-[11px] text-slate-400">+{extra} more</div>}
      </div>
    </div>
  )
}
