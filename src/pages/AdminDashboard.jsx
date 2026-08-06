import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import StatCard from '../components/StatCard.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import AddEmployeeModal from '../components/AddEmployeeModal.jsx'
import ReportModal from '../components/ReportModal.jsx'
import Modal from '../components/Modal.jsx'
import Avatar from '../components/Avatar.jsx'
import Section from '../components/Section.jsx'
import DataTable from '../components/DataTable.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getAllUsers, getAllRecords, updateUserProfile } from '../lib/firestoreHelpers.js'
import { buildEmployeeSummary, sortByDateDesc } from '../lib/aggregate.js'
import { birthdayState } from '../lib/birthday.js'
import { isManagedBy, hasNoManager } from '../lib/manager.js'
import { computeResourceRisk } from '../lib/resourceRisk.js'

// Happiness/risk conveyed by a presence dot + a faint tile tint (subtle for
// at-risk/watch, none for healthy — keeps the board calm).
const TILE_TINT = { red: 'bg-rose-500/[0.06]', amber: 'bg-amber-500/[0.05]', green: '' }
const DOT = { red: 'bg-rose-400', amber: 'bg-amber-400', green: 'bg-emerald-400' }
const DOT_GLOW = {
  red: 'shadow-[0_0_0_3px_rgba(251,113,133,0.18)]',
  amber: 'shadow-[0_0_0_3px_rgba(251,191,36,0.18)]',
  green: 'shadow-[0_0_0_3px_rgba(52,211,153,0.16)]',
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const admin = { uid: user.uid, name: profile?.name }
  const [loading, setLoading] = useState(true)
  const [summaries, setSummaries] = useState([])
  const [records, setRecords] = useState({})
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const [analysis, setAnalysis] = useState([])
  const [oneOnOnes, setOneOnOnes] = useState([])
  const [admins, setAdmins] = useState([])
  const [showReassign, setShowReassign] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [users, performance, grievances, recognitions, feedback, leaves, goals, ooo, ra] = await Promise.all([
      getAllUsers(),
      getAllRecords('performance'),
      getAllRecords('grievances'),
      getAllRecords('recognitions'),
      getAllRecords('feedback'),
      getAllRecords('leaves'),
      getAllRecords('goals'),
      getAllRecords('oneOnOnes'),
      getAllRecords('resourceAnalysis'),
    ])

    const employees = users.filter((u) => u.role === 'employee')
    setAdmins(users.filter((u) => u.role === 'admin'))
    const built = employees.map((u) =>
      buildEmployeeSummary(u, { performance, grievances, recognitions, feedback, leaves }),
    )
    setSummaries(built)
    setRecords({ performance, grievances, recognitions, feedback, leaves, goals })
    setOneOnOnes(ooo)
    setAnalysis(ra)
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

  // Happiness / risk colour per employee (green/amber/red), driven by the same
  // engine as the notes: grievances, performance, recognitions, 1:1/feedback
  // recency and the manager's private note sentiment.
  const riskByEmp = useMemo(() => {
    const analysisById = Object.fromEntries(analysis.map((a) => [a.id, a]))
    const byEmp = (arr, id) => (arr || []).filter((r) => r.employeeId === id)
    const map = {}
    for (const s of summaries) {
      const id = s.user.id
      map[id] = computeResourceRisk(
        {
          performance: byEmp(records.performance, id),
          grievances: byEmp(records.grievances, id),
          recognitions: byEmp(records.recognitions, id),
          feedback: byEmp(records.feedback, id),
          oneOnOnes: byEmp(oneOnOnes, id),
        },
        analysisById[id],
      ).level
    }
    return map
  }, [summaries, records, oneOnOnes, analysis])

  const departments = useMemo(
    () => [...new Set(managed.map((s) => s.user.department).filter(Boolean))].sort(),
    [managed],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return managed.filter((s) => {
      if (q && !(s.user.name?.toLowerCase().includes(q) || s.user.department?.toLowerCase().includes(q))) return false
      if (deptFilter && s.user.department !== deptFilter) return false
      if (riskFilter && riskByEmp[s.user.id] !== riskFilter) return false
      return true
    })
  }, [managed, search, deptFilter, riskFilter, riskByEmp])

  async function assignToMe(empId) {
    await updateUserProfile(empId, { managerUid: user.uid, managerName: profile?.name || '' })
    loadData()
  }

  async function bulkReassign(managerUid, managerName) {
    await Promise.all(
      [...selectedIds].map((id) => updateUserProfile(id, { managerUid: managerUid || '', managerName: managerName || '' })),
    )
    setSelectedIds(new Set())
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
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="font-semibold text-ink">
            Roster
            <span className="ml-2 text-sm font-normal text-ink-faint">{filtered.length}</span>
          </h2>
          <span className="flex items-center gap-3 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Healthy
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Watch
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> At risk
            </span>
          </span>
        </div>

        {/* Filters — slice 30 people down instead of scrolling. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search name or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full sm:w-auto sm:max-w-xs"
          />
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="input w-auto py-2">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="input w-auto py-2">
            <option value="">All statuses</option>
            <option value="red">At risk</option>
            <option value="amber">Watch</option>
            <option value="green">Healthy</option>
          </select>
          {filtered.length > 0 && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                className="h-4 w-4 accent-mint"
                checked={allFilteredSelected}
                onChange={toggleAllFiltered}
              />
              Select all
            </label>
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-mint/30 bg-mint/[0.08] px-3 py-2 text-sm">
            <span className="font-medium text-ink">{selectedIds.size} selected</span>
            <span className="text-ink-faint">·</span>
            <button type="button" onClick={() => setShowReport(true)} className="text-mint hover:underline">
              Download report
            </button>
            <button type="button" onClick={() => setShowReassign(true)} className="text-mint hover:underline">
              Reassign manager
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-ink-muted hover:text-ink hover:underline"
            >
              Clear
            </button>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-ink-faint">
            {managed.length === 0
              ? 'No employees are assigned to you yet.' +
                (unassigned.length ? ' Claim some from the Unassigned list below.' : '')
              : 'No employees match these filters.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {filtered.map((s) => (
              <PersonTile
                key={s.user.id}
                summary={s}
                risk={riskByEmp[s.user.id]}
                selected={selectedIds.has(s.user.id)}
                onToggle={() => toggleRow(s.user.id)}
                onOpen={() => navigate(`/employee/${s.user.id}`)}
              />
            ))}
          </div>
        )}
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
      {showReassign && (
        <BulkReassignModal
          count={selectedIds.size}
          admins={admins}
          onClose={() => setShowReassign(false)}
          onReassign={bulkReassign}
        />
      )}
    </Layout>
  )
}

// Reassign the selected employees to a manager account (or Unassigned).
function BulkReassignModal({ count, admins, onClose, onReassign }) {
  const [managerUid, setManagerUid] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const chosen = admins.find((a) => a.id === managerUid)
    await onReassign(chosen ? chosen.id : '', chosen ? chosen.name : '')
    setSubmitting(false)
    onClose()
  }

  return (
    <Modal title={`Reassign ${count} employee${count === 1 ? '' : 's'}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          Move the selected employees to another manager, or set them to Unassigned (they&apos;ll leave your roster).
        </p>
        <label className="block text-sm">
          <span className="font-medium text-ink">Reports to</span>
          <select value={managerUid} onChange={(e) => setManagerUid(e.target.value)} className="input mt-1">
            <option value="">Unassigned</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Saving…' : 'Reassign'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Compact, premium "team board" tile: avatar with a status presence-dot, name
// and department. Details on hover (tooltip) / click. Checkbox reveals on hover.
function PersonTile({ summary: s, risk, selected, onToggle, onOpen }) {
  const bday = birthdayState(s.user.birthday)
  const flags = s.flags.filter((f) => f !== 'OK')
  const rating = s.latestPerformance ? `${s.latestPerformance.rating}/5` : '—'
  const tip = `${s.user.name} · ${s.user.department || '—'}\nRating ${rating} · ${s.openGrievanceCount} open grievance(s) · ${s.leaveBalance.total} leave${flags.length ? `\n${flags.join(', ')}` : ''}`

  return (
    <div
      onClick={onOpen}
      title={tip}
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.05] hover:shadow-lg hover:shadow-black/30 ${
        selected ? 'border-mint/60 bg-mint/[0.06]' : `border-white/[0.07] bg-white/[0.025] ${TILE_TINT[risk] || ''}`
      }`}
    >
      {/* selection checkbox — hidden until hover or when selected */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${s.user.name}`}
        className={`absolute left-1.5 top-1.5 h-3.5 w-3.5 accent-mint transition-opacity ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      />

      <div className="relative shrink-0">
        <Avatar name={s.user.name} colorKey={s.user.id} size="md" />
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface ${DOT[risk] || 'bg-white/25'} ${DOT_GLOW[risk] || ''}`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink">
          <span className="truncate">{s.user.name}</span>
          {bday && <span title={`Birthday ${bday}`}>🎂</span>}
          {flags.length > 0 && <span className="text-amber-300" title={flags.join(', ')}>⚠</span>}
        </p>
        <p className="truncate text-xs text-ink-faint">{s.user.department || '—'}</p>
      </div>
    </div>
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
