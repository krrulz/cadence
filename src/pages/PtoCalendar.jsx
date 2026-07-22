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
  'bg-brand-100 text-mint-800',
  'bg-accent-100 text-accent-800',
  'bg-brand-200 text-mint-900',
  'bg-accent-200 text-accent-900',
  'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800',
  'bg-teal-100 text-teal-800',
  'bg-fuchsia-100 text-fuchsia-800',
]
// Same palette order as SWATCHES, but as solid dot colours for the compact
// mobile cells (a name pill can't fit in a ~50px day cell).
const DOT_SWATCHES = [
  'bg-brand-300',
  'bg-accent-300',
  'bg-brand-400',
  'bg-accent-400',
  'bg-emerald-400',
  'bg-violet-400',
  'bg-teal-400',
  'bg-fuchsia-400',
]
function hashKey(key) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return hash
}
function swatchFor(key) {
  return SWATCHES[hashKey(key) % SWATCHES.length]
}
function dotFor(key) {
  return DOT_SWATCHES[hashKey(key) % DOT_SWATCHES.length]
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

  // Mobile agenda: entries touching the viewed month, since the compact phone
  // grid only shows dots. ISO strings compare lexicographically.
  const monthStartISO = toISO(new Date(view.year, view.month, 1))
  const monthEndISO = toISO(new Date(view.year, view.month + 1, 0))
  const monthAgenda = useMemo(
    () =>
      shown
        .filter((l) => l.dateFrom && l.dateTo && l.dateFrom <= monthEndISO && l.dateTo >= monthStartISO)
        .sort((a, b) => a.dateFrom.localeCompare(b.dateFrom)),
    [shown, monthStartISO, monthEndISO],
  )
  const monthHolidays = useMemo(
    () =>
      holidays
        .filter((h) => h.date >= monthStartISO && h.date <= monthEndISO)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [holidays, monthStartISO, monthEndISO],
  )

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
          <h1 className="text-xl font-semibold text-ink">Leave Calendar</h1>
          <p className="text-sm text-ink-muted">
            {isAdmin ? "Who's off across the team." : "Your approved and requested leave."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="h-4 w-4 accent-mint"
            checked={includePending}
            onChange={(e) => setIncludePending(e.target.checked)}
          />
          Include pending
        </label>
      </div>

      <div className="mt-4 card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">{monthLabel(view.year, view.month)}</h2>
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
          <>
            {/* Fluid 7-col grid: full pills on sm+, compact dot cells on phones. */}
            <div className="min-w-0">
              <div className="grid grid-cols-7 border-b border-surface-border text-xs font-medium uppercase tracking-wide text-ink-muted">
                {WEEKDAY_LABELS.map((d) => (
                  <div key={d} className="px-1 py-2 text-center sm:px-2 sm:text-left">
                    <span className="sm:hidden">{d[0]}</span>
                    <span className="hidden sm:inline">{d}</span>
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

            {/* Phone agenda — the dot cells can't carry names, so list the
                month's entries beneath the grid. Hidden on sm+. */}
            <div className="mt-4 border-t border-surface-border pt-3 sm:hidden">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">This month</p>
              {monthAgenda.length === 0 && monthHolidays.length === 0 ? (
                <p className="text-sm text-ink-faint">Nothing scheduled this month.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {monthHolidays.map((h) => (
                    <li key={h.id} className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                      <span className="text-ink-muted">{h.date.slice(5)}</span>
                      <span className="truncate text-amber-300">{h.name}</span>
                    </li>
                  ))}
                  {monthAgenda.map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dotFor(l.employeeId)}`} />
                      <span className="whitespace-nowrap text-ink-muted">
                        {l.dateFrom.slice(5)}
                        {l.dateTo !== l.dateFrom ? `–${l.dateTo.slice(5)}` : ''}
                      </span>
                      <span className="truncate text-ink">
                        {isAdmin ? namesByUid[l.employeeId] || 'Unknown' : l.leaveType}
                      </span>
                      {l.status === 'Pending' && <span className="shrink-0 text-xs text-ink-faint">(pending)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
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
      <h2 className="mb-1 font-semibold text-ink">Public holidays</h2>
      <p className="mb-4 text-sm text-ink-muted">
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
        <p className="text-sm text-ink-faint">No holidays added yet.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {sorted.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-medium text-ink">{h.date}</span>
                <span className="ml-3 text-ink-muted">{h.name}</span>
              </span>
              <button
                type="button"
                onClick={() => removeHoliday(h.id)}
                className="text-ink-faint hover:text-rose-400 hover:underline"
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
  const MAX_DOTS = 4
  const dotLeaves = dayLeaves.slice(0, MAX_DOTS)
  const extraDots = dayLeaves.length - dotLeaves.length

  return (
    <div
      className={`min-h-[52px] border-b border-r border-white/5 p-1 sm:min-h-[92px] sm:p-1.5 ${
        holidayName && inMonth
          ? 'bg-amber-500/10'
          : inMonth
            ? isWeekend(date)
              ? 'bg-white/[0.04]'
              : 'bg-white/[0.02]'
            : 'bg-white/[0.03] text-ink-faint'
      }`}
    >
      <div className="mb-1 flex items-center justify-center sm:justify-between">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] sm:h-6 sm:w-6 sm:text-xs ${
            isToday(date) ? 'bg-brand font-semibold text-white' : inMonth ? 'text-ink-muted' : 'text-ink-faint'
          }`}
        >
          {date.getDate()}
        </span>
      </div>

      {/* Phone: dots only — names live in the agenda list below the grid. */}
      <div className="flex flex-wrap items-center justify-center gap-0.5 sm:hidden">
        {holidayName && inMonth && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
        {dotLeaves.map((leave) => (
          <span
            key={leave.id}
            className={`h-1.5 w-1.5 rounded-full ${dotFor(leave.employeeId)} ${
              leave.status === 'Pending' ? 'opacity-50' : ''
            }`}
          />
        ))}
        {extraDots > 0 && <span className="text-[9px] leading-none text-ink-faint">+{extraDots}</span>}
      </div>

      {/* sm+: full pills as before. */}
      <div className="hidden sm:block">
        {holidayName && inMonth && (
          <div className="mb-1 truncate rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-300" title={holidayName}>
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
                  pending ? 'opacity-60 ring-1 ring-inset ring-white/20' : ''
                }`}
              >
                {label}
              </div>
            )
          })}
          {extra > 0 && <div className="px-1.5 text-[11px] text-ink-faint">+{extra} more</div>}
        </div>
      </div>
    </div>
  )
}
