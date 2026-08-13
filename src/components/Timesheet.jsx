import { useCallback, useEffect, useMemo, useState } from 'react'
import Section from './Section.jsx'
import Modal from './Modal.jsx'
import { LabeledInput, FormActions } from './FormFields.jsx'
import { getRecordsForEmployee, addRecord, deleteRecord, setRecordById } from '../lib/firestoreHelpers.js'
import { toISO, isWeekend as isWeekendDate, parseISO } from '../lib/calendar.js'
import {
  MAX_DAILY_HOURS,
  currentYearMonth,
  shiftYearMonth,
  monthLabelFromYearMonth,
  entriesForMonth,
  hoursByDate,
  splitHoursAcrossDays,
  wouldExceedDailyCap,
  monthSummary,
} from '../lib/timesheet.js'

function todayISO() {
  return toISO(new Date())
}

function periodDocId(employeeId, yearMonth) {
  return `${employeeId}_${yearMonth}`
}

// Working-days-worked calendar: employees log hours against a Clarity ID +
// Epic, one month at a time. Normal entries auto-split across working days;
// weekend/overtime hours go through a separate flow that requires a
// justification. A month can be frozen (by the employee) for month-end
// invoicing, and only unlocked again by the admin (their manager).
export default function Timesheet({ employeeId, viewer, canUnlock = false }) {
  const [allEntries, setAllEntries] = useState([])
  const [periods, setPeriods] = useState({}) // yearMonth -> period doc
  const [loading, setLoading] = useState(true)
  const [yearMonth, setYearMonth] = useState(currentYearMonth())
  const [modal, setModal] = useState(null) // 'log' | 'extra' | { type:'edit', data }

  const loadData = useCallback(async () => {
    setLoading(true)
    const [entries, periodDocs] = await Promise.all([
      getRecordsForEmployee('timesheetEntries', employeeId),
      getRecordsForEmployee('timesheetPeriods', employeeId),
    ])
    setAllEntries(entries)
    setPeriods(Object.fromEntries(periodDocs.map((p) => [p.yearMonth, p])))
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const monthEntries = useMemo(
    () => entriesForMonth(allEntries, yearMonth).sort((a, b) => a.date.localeCompare(b.date)),
    [allEntries, yearMonth],
  )
  const summary = useMemo(() => monthSummary(monthEntries), [monthEntries])
  const period = periods[yearMonth]
  const isFrozen = period?.status === 'frozen'
  const canEdit = !isFrozen

  const entriesByDate = useMemo(() => {
    const map = {}
    for (const e of monthEntries) (map[e.date] ||= []).push(e)
    return map
  }, [monthEntries])

  async function handleFreeze() {
    if (!window.confirm(`Freeze ${monthLabelFromYearMonth(yearMonth)}? You won't be able to edit entries afterwards unless your manager unlocks it.`))
      return
    await setRecordById('timesheetPeriods', periodDocId(employeeId, yearMonth), {
      employeeId,
      yearMonth,
      status: 'frozen',
      frozenAt: new Date().toISOString(),
      frozenBy: viewer?.uid || '',
    })
    loadData()
  }

  async function handleUnlock() {
    await setRecordById('timesheetPeriods', periodDocId(employeeId, yearMonth), {
      employeeId,
      yearMonth,
      status: 'open',
      unlockedAt: new Date().toISOString(),
      unlockedBy: viewer?.name || viewer?.uid || '',
    })
    loadData()
  }

  async function handleDelete(entry) {
    if (!window.confirm('Delete this entry?')) return
    await deleteRecord('timesheetEntries', entry.id)
    loadData()
  }

  return (
    <div className="space-y-6">
      <Section title="Timesheet">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setYearMonth((m) => shiftYearMonth(m, -1))} className="btn-secondary px-2 py-1 text-sm">
              ←
            </button>
            <span className="min-w-[10rem] text-center font-semibold text-ink">{monthLabelFromYearMonth(yearMonth)}</span>
            <button type="button" onClick={() => setYearMonth((m) => shiftYearMonth(m, 1))} className="btn-secondary px-2 py-1 text-sm">
              →
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <>
                <button type="button" onClick={() => setModal('log')} className="btn-primary text-xs">
                  + Log hours
                </button>
                <button type="button" onClick={() => setModal('extra')} className="btn-secondary text-xs">
                  + Extra / weekend hours
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total hours', value: summary.totalHours },
            { label: 'Days logged', value: summary.daysLogged },
            { label: 'Weekend hours', value: summary.weekendHours },
            { label: 'Overtime hours', value: summary.overtimeHours },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-white/5 px-3 py-2 text-center">
              <p className="text-lg font-semibold text-ink">{s.value}</p>
              <p className="text-xs text-ink-muted">{s.label}</p>
            </div>
          ))}
        </div>

        {isFrozen ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300 ring-1 ring-inset ring-amber-500/30">
            <span>
              🔒 Frozen{period?.frozenAt ? ` on ${period.frozenAt.slice(0, 10)}` : ''}. Ask your manager to unlock this
              month if you need to make changes.
            </span>
            {canUnlock && (
              <button type="button" onClick={handleUnlock} className="btn-secondary shrink-0 text-xs">
                Unlock month
              </button>
            )}
          </div>
        ) : (
          monthEntries.length > 0 && (
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={handleFreeze} className="btn-secondary text-xs">
                Freeze {monthLabelFromYearMonth(yearMonth)}
              </button>
            </div>
          )
        )}

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-ink-faint">Loading timesheet…</p>
          ) : monthEntries.length === 0 ? (
            <p className="text-sm text-ink-faint">No hours logged for {monthLabelFromYearMonth(yearMonth)} yet.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(entriesByDate).map(([date, entries]) => (
                <div key={date} className="rounded-lg border border-surface-border p-3">
                  <p className="text-sm font-medium text-ink">
                    {date}
                    <span className="ml-2 text-xs text-ink-faint">{weekdayLabel(date)}</span>
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {entries.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="text-ink">
                            {e.clarityId} · {e.clarityName}
                          </span>
                          <span className="text-ink-faint"> — {e.epicId} · {e.epicName}</span>
                          {(e.weekend || e.overtime) && (
                            <span className="ml-2 inline-flex gap-1">
                              {e.weekend && (
                                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
                                  Weekend
                                </span>
                              )}
                              {e.overtime && (
                                <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30">
                                  Overtime
                                </span>
                              )}
                            </span>
                          )}
                          {e.justification && <span className="block text-xs text-ink-faint">Reason: {e.justification}</span>}
                        </span>
                        <span className="shrink-0 font-medium text-ink">{e.hours}h</span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleDelete(e)}
                            className="shrink-0 text-ink-faint hover:text-rose-400"
                            aria-label="Delete entry"
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {modal === 'log' && (
        <LogHoursModal
          employeeId={employeeId}
          viewer={viewer}
          allEntries={allEntries}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal === 'extra' && (
        <ExtraHoursModal
          employeeId={employeeId}
          viewer={viewer}
          allEntries={allEntries}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
    </div>
  )
}

function weekdayLabel(dateISO) {
  const d = parseISO(dateISO)
  return d ? d.toLocaleDateString('en', { weekday: 'short' }) : ''
}

function LogHoursModal({ employeeId, viewer, allEntries, onClose, onSaved }) {
  const [clarityId, setClarityId] = useState('')
  const [clarityName, setClarityName] = useState('')
  const [epicId, setEpicId] = useState('')
  const [epicName, setEpicName] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [totalHours, setTotalHours] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const existingHoursByDate = useMemo(() => hoursByDate(allEntries), [allEntries])
  const preview = useMemo(
    () =>
      splitHoursAcrossDays({
        startDateISO: startDate,
        totalHours: Number(totalHours) || 0,
        existingHoursByDate,
      }),
    [startDate, totalHours, existingHoursByDate],
  )

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (preview.length === 0) {
      setError('Enter a start date and hours to see the split.')
      return
    }
    setSubmitting(true)
    try {
      const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await Promise.all(
        preview.map((d) =>
          addRecord('timesheetEntries', {
            employeeId,
            date: d.date,
            yearMonth: d.date.slice(0, 7),
            clarityId,
            clarityName,
            epicId,
            epicName,
            hours: d.hours,
            weekend: false,
            overtime: false,
            justification: '',
            batchId,
            createdByUid: viewer?.uid || '',
            createdAt: new Date().toISOString(),
          }),
        ),
      )
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save these hours.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Log hours" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="Clarity ID" required value={clarityId} onChange={setClarityId} />
          <LabeledInput label="Clarity Name" required value={clarityName} onChange={setClarityName} />
          <LabeledInput label="Epic ID" required value={epicId} onChange={setEpicId} />
          <LabeledInput label="Epic Name" required value={epicName} onChange={setEpicName} />
          <LabeledInput label="Start date" type="date" required value={startDate} onChange={setStartDate} />
          <LabeledInput label="Total hours" type="number" min="0.5" step="0.5" required value={totalHours} onChange={setTotalHours} />
        </div>

        <p className="text-xs text-ink-faint">
          Hours are automatically split across working days from the start date, up to {MAX_DAILY_HOURS}h/day (skipping
          weekends and any day you're already full on). Need weekend or over-8h time? Use "Extra / weekend hours" instead.
        </p>

        {preview.length > 0 && (
          <div className="rounded-lg border border-surface-border p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Preview</p>
            <ul className="space-y-1 text-sm">
              {preview.map((d) => (
                <li key={d.date} className="flex justify-between text-ink-muted">
                  <span>
                    {d.date} <span className="text-ink-faint">{weekdayLabel(d.date)}</span>
                  </span>
                  <span className="font-medium text-ink">{d.hours}h</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}
        <FormActions submitting={submitting} onCancel={onClose} submitLabel="Log hours" />
      </form>
    </Modal>
  )
}

function ExtraHoursModal({ employeeId, viewer, allEntries, onClose, onSaved }) {
  const [clarityId, setClarityId] = useState('')
  const [clarityName, setClarityName] = useState('')
  const [epicId, setEpicId] = useState('')
  const [epicName, setEpicName] = useState('')
  const [date, setDate] = useState(todayISO())
  const [hours, setHours] = useState('')
  const [justification, setJustification] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const weekend = date ? isWeekendDate(parseISO(date)) : false
  const overtime = date && hours ? wouldExceedDailyCap(allEntries, date, Number(hours)) : false

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!justification.trim()) {
      setError('A business justification or change number is required for extra or weekend hours.')
      return
    }
    setSubmitting(true)
    try {
      await addRecord('timesheetEntries', {
        employeeId,
        date,
        yearMonth: date.slice(0, 7),
        clarityId,
        clarityName,
        epicId,
        epicName,
        hours: Number(hours),
        weekend,
        overtime,
        justification: justification.trim(),
        batchId: '',
        createdByUid: viewer?.uid || '',
        createdAt: new Date().toISOString(),
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save this entry.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Extra / weekend hours" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="Clarity ID" required value={clarityId} onChange={setClarityId} />
          <LabeledInput label="Clarity Name" required value={clarityName} onChange={setClarityName} />
          <LabeledInput label="Epic ID" required value={epicId} onChange={setEpicId} />
          <LabeledInput label="Epic Name" required value={epicName} onChange={setEpicName} />
          <LabeledInput label="Date" type="date" required value={date} onChange={setDate} />
          <LabeledInput label="Hours" type="number" min="0.5" step="0.5" required value={hours} onChange={setHours} />
        </div>

        {(weekend || overtime) && (
          <p className="text-xs text-ink-faint">
            {weekend && overtime
              ? 'This falls on a weekend and pushes the day over 8h — flagged as both.'
              : weekend
                ? 'This falls on a weekend.'
                : 'This pushes the day over 8h — flagged as overtime.'}
          </p>
        )}

        <LabeledInput
          label="Business justification or change number"
          required
          value={justification}
          onChange={setJustification}
          placeholder="e.g. CHG0012345 — client go-live weekend support"
        />

        {error && <p className="text-sm text-rose-400">{error}</p>}
        <FormActions submitting={submitting} onCancel={onClose} submitLabel="Add entry" />
      </form>
    </Modal>
  )
}
