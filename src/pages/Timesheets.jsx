import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Avatar from '../components/Avatar.jsx'
import Modal from '../components/Modal.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getAllUsers, getAllRecords } from '../lib/firestoreHelpers.js'
import { isManagedBy } from '../lib/manager.js'
import { buildCsv, downloadTextFile } from '../lib/csv.js'
import { shiftYearMonth, currentYearMonth, monthLabelFromYearMonth, employeeMonthRows } from '../lib/timesheet.js'

export default function Timesheets() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [entries, setEntries] = useState([])
  const [periodDocs, setPeriodDocs] = useState([])
  const [scope, setScope] = useState('team') // 'team' | 'all'
  const [yearMonth, setYearMonth] = useState(currentYearMonth())
  const [filterDept, setFilterDept] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [showExport, setShowExport] = useState(false)

  const admin = { uid: user.uid, name: profile?.name }

  const loadData = useCallback(async () => {
    setLoading(true)
    const [u, e, p] = await Promise.all([
      getAllUsers(),
      getAllRecords('timesheetEntries'),
      getAllRecords('timesheetPeriods'),
    ])
    setUsers(u)
    setEntries(e)
    setPeriodDocs(p)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const periods = useMemo(() => Object.fromEntries(periodDocs.map((p) => [p.id, p])), [periodDocs])

  const scopedEmployees = useMemo(
    () => users.filter((u) => u.role === 'employee' && (scope === 'all' || isManagedBy(u, admin))),
    [users, scope, admin.uid, admin.name],
  )

  const deptOptions = useMemo(
    () => [...new Set(scopedEmployees.map((e) => e.department?.trim() || 'Unassigned'))].sort((a, b) => a.localeCompare(b)),
    [scopedEmployees],
  )
  const employeeOptions = useMemo(
    () =>
      scopedEmployees
        .filter((e) => !filterDept || (e.department?.trim() || 'Unassigned') === filterDept)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [scopedEmployees, filterDept],
  )

  const filteredEmployees = useMemo(
    () =>
      scopedEmployees
        .filter((e) => !filterDept || (e.department?.trim() || 'Unassigned') === filterDept)
        .filter((e) => !filterEmployee || e.id === filterEmployee),
    [scopedEmployees, filterDept, filterEmployee],
  )

  const rows = useMemo(
    () => employeeMonthRows(filteredEmployees, entries, periods, yearMonth).sort((a, b) => a.employee.name.localeCompare(b.employee.name)),
    [filteredEmployees, entries, periods, yearMonth],
  )

  const totals = useMemo(
    () => ({
      totalHours: rows.reduce((s, r) => s + r.totalHours, 0),
      weekendHours: rows.reduce((s, r) => s + r.weekendHours, 0),
      overtimeHours: rows.reduce((s, r) => s + r.overtimeHours, 0),
      frozenCount: rows.filter((r) => r.status === 'Frozen').length,
    }),
    [rows],
  )

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner label="Loading timesheets…" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Timesheets</h1>
          <p className="text-sm text-ink-muted">Review logged hours and export month-end data for invoicing.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-surface-border p-0.5 text-sm">
            {[
              { k: 'team', label: 'My team' },
              { k: 'all', label: 'All employees' },
            ].map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setScope(o.k)}
                className={`rounded-md px-3 py-1 font-medium ${scope === o.k ? 'bg-white/10 text-ink' : 'text-ink-muted hover:text-ink'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowExport(true)} className="btn-secondary text-sm">
            Export…
          </button>
        </div>
      </div>

      <div className="mt-6 card">
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
          <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-md sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-ink">Department</span>
              <select
                value={filterDept}
                onChange={(e) => {
                  setFilterDept(e.target.value)
                  setFilterEmployee('')
                }}
                className="input mt-1"
              >
                <option value="">All departments</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">Employee</span>
              <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className="input mt-1">
                <option value="">All employees</option>
                {employeeOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total hours', value: totals.totalHours },
          { label: 'Weekend hours', value: totals.weekendHours },
          { label: 'Overtime hours', value: totals.overtimeHours },
          { label: 'Frozen employees', value: `${totals.frozenCount}/${rows.length}` },
        ].map((s) => (
          <div key={s.label} className="card">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-ink">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 card">
        {rows.length === 0 ? (
          <p className="text-center text-ink-faint">No employees match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Department</th>
                  <th className="py-2 pr-4">Total hrs</th>
                  <th className="py-2 pr-4">Days logged</th>
                  <th className="py-2 pr-4">Weekend hrs</th>
                  <th className="py-2 pr-4">Overtime hrs</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.employee.id}
                    onClick={() => navigate(`/employee/${r.employee.id}`)}
                    className="cursor-pointer border-b border-white/5 hover:bg-white/[0.03]"
                  >
                    <td className="py-2 pr-4">
                      <span className="flex items-center gap-2">
                        <Avatar name={r.employee.name} colorKey={r.employee.id} size="sm" />
                        {r.employee.name}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-ink-muted">{r.employee.department || 'Unassigned'}</td>
                    <td className="py-2 pr-4 font-medium text-ink">{r.totalHours}</td>
                    <td className="py-2 pr-4 text-ink-muted">{r.daysLogged}</td>
                    <td className="py-2 pr-4 text-ink-muted">{r.weekendHours}</td>
                    <td className="py-2 pr-4 text-ink-muted">{r.overtimeHours}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === 'Frozen'
                            ? 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30'
                            : 'bg-white/10 text-ink-muted'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showExport && (
        <ExportModal
          rows={rows}
          yearMonth={yearMonth}
          filterSummary={`${scope === 'team' ? 'My team' : 'All employees'}${filterDept ? ` · ${filterDept}` : ''}${
            filterEmployee ? ` · ${employeeOptions.find((e) => e.id === filterEmployee)?.name || ''}` : ''
          }`}
          onClose={() => setShowExport(false)}
        />
      )}
    </Layout>
  )
}

function ExportModal({ rows, yearMonth, filterSummary, onClose }) {
  const allEntries = useMemo(() => rows.flatMap((r) => r.entries.map((e) => ({ ...e, employee: r.employee }))), [rows])

  function handleDownload() {
    const headers = [
      'Employee Name',
      'Employee UUID',
      'Department',
      'Date',
      'Clarity ID',
      'Clarity Name',
      'Epic ID',
      'Epic Name',
      'Hours',
      'Weekend',
      'Overtime',
      'Justification',
    ]
    const csvRows = allEntries
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name) || a.date.localeCompare(b.date))
      .map((e) => [
        e.employee.name,
        e.employee.id,
        e.employee.department || 'Unassigned',
        e.date,
        e.clarityId,
        e.clarityName,
        e.epicId,
        e.epicName,
        e.hours,
        e.weekend ? 'Yes' : 'No',
        e.overtime ? 'Yes' : 'No',
        e.justification || '',
      ])
    const csv = buildCsv(headers, csvRows)
    downloadTextFile(`timesheets-${yearMonth}.csv`, csv)
  }

  return (
    <Modal title="Export timesheet data" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          {monthLabelFromYearMonth(yearMonth)} · {filterSummary}
        </p>
        <p className="text-sm text-ink-muted">{allEntries.length} entr{allEntries.length === 1 ? 'y' : 'ies'} to export.</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleDownload} disabled={allEntries.length === 0} className="btn-primary">
            Download CSV
          </button>
        </div>
      </div>
    </Modal>
  )
}
