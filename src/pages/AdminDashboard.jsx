import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import AddEmployeeModal from '../components/AddEmployeeModal.jsx'
import ReportModal from '../components/ReportModal.jsx'
import Avatar from '../components/Avatar.jsx'
import Section from '../components/Section.jsx'
import DataTable from '../components/DataTable.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getAllUsers, getAllRecords, updateUserProfile } from '../lib/firestoreHelpers.js'
import { buildEmployeeSummary, sortByDateDesc } from '../lib/aggregate.js'
import { birthdayState } from '../lib/birthday.js'
import { isManagedBy, hasNoManager } from '../lib/manager.js'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const admin = { uid: user.uid, name: profile?.name }
  const [loading, setLoading] = useState(true)
  const [summaries, setSummaries] = useState([])
  const [records, setRecords] = useState({})
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const loadData = useCallback(async () => {
    setLoading(true)
    const [users, performance, grievances, recognitions, feedback, leaves, goals] = await Promise.all([
      getAllUsers(),
      getAllRecords('performance'),
      getAllRecords('grievances'),
      getAllRecords('recognitions'),
      getAllRecords('feedback'),
      getAllRecords('leaves'),
      getAllRecords('goals'),
    ])

    const employees = users.filter((u) => u.role === 'employee')
    const built = employees.map((u) =>
      buildEmployeeSummary(u, { performance, grievances, recognitions, feedback, leaves }),
    )
    setSummaries(built)
    setRecords({ performance, grievances, recognitions, feedback, leaves, goals })
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Only your own reportees appear in the roster; everyone else is either
  // another manager's or sitting unassigned (shown in a separate area below).
  const managed = useMemo(
    () => summaries.filter((s) => isManagedBy(s.user, admin)),
    [summaries, admin.uid, admin.name],
  )
  const unassigned = useMemo(() => summaries.filter((s) => hasNoManager(s.user)), [summaries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return managed
    return managed.filter(
      (s) => s.user.name?.toLowerCase().includes(q) || s.user.department?.toLowerCase().includes(q),
    )
  }, [managed, search])

  async function assignToMe(empId) {
    await updateUserProfile(empId, { managerUid: user.uid, managerName: profile?.name || '' })
    loadData()
  }

  const allEmployees = useMemo(() => managed.map((s) => s.user), [managed])
  const scopeEmployees = useMemo(
    () => (selectedIds.size ? allEmployees.filter((e) => selectedIds.has(e.id)) : allEmployees),
    [allEmployees, selectedIds],
  )
  const filteredIds = useMemo(() => filtered.map((s) => s.user.id), [filtered])
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id))

  function toggleRow(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id))
      else filteredIds.forEach((id) => next.add(id))
      return next
    })
  }

  const stats = useMemo(() => {
    const teamSize = managed.length
    const totalOpenGrievances = managed.reduce((sum, s) => sum + s.openGrievanceCount, 0)
    const rated = managed.filter((s) => s.latestPerformance)
    const avgRating = rated.length
      ? (rated.reduce((sum, s) => sum + Number(s.latestPerformance.rating), 0) / rated.length).toFixed(1)
      : '—'
    const flagged = managed.filter((s) => !(s.flags.length === 1 && s.flags[0] === 'OK')).length
    return { teamSize, totalOpenGrievances, avgRating, flagged }
  }, [managed])

  // Recognitions addressed to the admin themselves. The roster only lists
  // employees, so without this an employee-given recognition to the admin has
  // nowhere to show and would be invisible.
  const myRecognitions = useMemo(
    () => sortByDateDesc((records.recognitions || []).filter((r) => r.employeeId === user?.uid), 'date'),
    [records.recognitions, user?.uid],
  )

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner label="Loading team data…" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink tracking-tight">My Team</h1>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowReport(true)} className="btn-secondary">
            ⤓ Download report
          </button>
          <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary">
            + Add Employee
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Team Size" value={stats.teamSize} />
        <StatCard label="Open Grievances" value={stats.totalOpenGrievances} />
        <StatCard label="Avg. Latest Rating" value={stats.avgRating} />
        <StatCard label="Flagged for Attention" value={stats.flagged} />
      </div>

      <div className="mt-6 card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">
            Roster
            {selectedIds.size > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-faint">{selectedIds.size} selected</span>
            )}
          </h2>
          <input
            type="text"
            placeholder="Search by name or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full sm:w-auto sm:max-w-xs"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-mint"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    aria-label="Select all"
                  />
                </th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4">Latest Rating</th>
                <th className="py-2 pr-4">Open Grievances</th>
                <th className="py-2 pr-4">Last Recognition</th>
                <th className="py-2 pr-4">Last Feedback</th>
                <th className="py-2 pr-4">Leave Balance</th>
                <th className="py-2 pr-4">Attention</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.user.id}
                  onClick={() => navigate(`/employee/${s.user.id}`)}
                  className="cursor-pointer border-b border-white/5 hover:bg-white/[0.03]"
                >
                  <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-mint"
                      checked={selectedIds.has(s.user.id)}
                      onChange={() => toggleRow(s.user.id)}
                      aria-label={`Select ${s.user.name}`}
                    />
                  </td>
                  <td className="py-2 pr-4 font-medium text-ink">
                    <div className="flex items-center gap-2">
                      <Avatar name={s.user.name} colorKey={s.user.id} size="sm" />
                      <span>{s.user.name}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-ink-muted">{s.user.department}</td>
                  <td className="py-2 pr-4 text-ink-muted">
                    {s.latestPerformance ? s.latestPerformance.rating : '—'}
                  </td>
                  <td className="py-2 pr-4 text-ink-muted">{s.openGrievanceCount}</td>
                  <td className="py-2 pr-4 text-ink-muted">{s.latestRecognition?.date || '—'}</td>
                  <td className="py-2 pr-4 text-ink-muted">{s.latestFeedback?.date || '—'}</td>
                  <td className="py-2 pr-4 text-ink-muted">{s.leaveBalance.total}</td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        // Birthday reminder: visible from the day before until
                        // the end of the birthday itself.
                        const bday = birthdayState(s.user.birthday)
                        return (
                          bday && (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-fuchsia-500/15 px-2.5 py-0.5 text-xs font-medium text-fuchsia-300 ring-1 ring-inset ring-fuchsia-500/30">
                              🎂 {bday === 'today' ? 'Birthday today' : 'Birthday tomorrow'}
                            </span>
                          )
                        )
                      })()}
                      {s.flags.map((flag) => (
                        <StatusBadge key={flag} label={flag} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-faint">
                    {managed.length === 0
                      ? 'No employees are assigned to you yet.' +
                        (unassigned.length ? ' Claim some from the Unassigned list below.' : '')
                      : 'No employees match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {unassigned.length > 0 && (
        <UnassignedPanel unassigned={unassigned} onAssign={assignToMe} />
      )}

      {myRecognitions.length > 0 && (
        <div className="mt-6">
          <Section title="Recognitions for you">
            <DataTable
              headers={['Date', 'Type', 'Description', 'From']}
              rows={myRecognitions.map((r) => [
                r.date,
                r.type,
                r.description,
                `${r.givenBy}${r.source === 'peer' ? ' (peer)' : ''}`,
              ])}
              emptyText="No recognitions yet."
            />
          </Section>
        </div>
      )}

      {showAddModal && (
        <AddEmployeeModal manager={admin} onClose={() => setShowAddModal(false)} onCreated={loadData} />
      )}
      {showReport && (
        <ReportModal scopeEmployees={scopeEmployees} records={records} onClose={() => setShowReport(false)} />
      )}
    </Layout>
  )
}

// Employees with no manager set — hidden from every roster until someone claims
// them. Collapsed by default so they don't clutter the main view.
function UnassignedPanel({ unassigned, onAssign }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-6 card border-amber-500/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="font-semibold text-ink">
          Unassigned employees
          <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
            {unassigned.length}
          </span>
        </span>
        <span className="text-ink-faint">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <p className="mt-2 text-sm text-ink-muted">
            These have no manager set, so they don&apos;t appear in any manager&apos;s team. Claim the ones that report
            to you.
          </p>
          <ul className="mt-3 divide-y divide-white/5">
            {unassigned.map((s) => (
              <li key={s.user.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2">
                  <Avatar name={s.user.name} colorKey={s.user.id} size="sm" />
                  <span>
                    <span className="text-sm font-medium text-ink">{s.user.name}</span>
                    <span className="ml-2 text-xs text-ink-faint">{s.user.department}</span>
                  </span>
                </span>
                <button type="button" onClick={() => onAssign(s.user.id)} className="btn-secondary text-xs">
                  Assign to me
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
