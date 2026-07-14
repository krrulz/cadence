import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import StatCard from '../components/StatCard.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import AddEmployeeModal from '../components/AddEmployeeModal.jsx'
import { getAllUsers, getAllRecords } from '../lib/firestoreHelpers.js'
import { buildEmployeeSummary } from '../lib/aggregate.js'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [summaries, setSummaries] = useState([])
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const [users, performance, grievances, recognitions, feedback, leaves] = await Promise.all([
      getAllUsers(),
      getAllRecords('performance'),
      getAllRecords('grievances'),
      getAllRecords('recognitions'),
      getAllRecords('feedback'),
      getAllRecords('leaves'),
    ])

    const employees = users.filter((u) => u.role === 'employee')
    const built = employees.map((u) =>
      buildEmployeeSummary(u, { performance, grievances, recognitions, feedback, leaves }),
    )
    setSummaries(built)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return summaries
    return summaries.filter(
      (s) => s.user.name?.toLowerCase().includes(q) || s.user.department?.toLowerCase().includes(q),
    )
  }, [summaries, search])

  const stats = useMemo(() => {
    const teamSize = summaries.length
    const totalOpenGrievances = summaries.reduce((sum, s) => sum + s.openGrievanceCount, 0)
    const rated = summaries.filter((s) => s.latestPerformance)
    const avgRating = rated.length
      ? (rated.reduce((sum, s) => sum + Number(s.latestPerformance.rating), 0) / rated.length).toFixed(1)
      : '—'
    const flagged = summaries.filter((s) => !(s.flags.length === 1 && s.flags[0] === 'OK')).length
    return { teamSize, totalOpenGrievances, avgRating, flagged }
  }, [summaries])

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
        <h1 className="text-xl font-semibold text-slate-900">Admin Dashboard</h1>
        <button type="button" onClick={() => setShowAddModal(true)} className="btn-primary">
          + Add Employee
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Team Size" value={stats.teamSize} />
        <StatCard label="Open Grievances" value={stats.totalOpenGrievances} />
        <StatCard label="Avg. Latest Rating" value={stats.avgRating} />
        <StatCard label="Flagged for Attention" value={stats.flagged} />
      </div>

      <div className="mt-6 card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-accent">Roster</h2>
          <input
            type="text"
            placeholder="Search by name or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full sm:w-auto sm:max-w-xs"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="py-2 pr-4 font-medium text-slate-800">{s.user.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.user.department}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    {s.latestPerformance ? s.latestPerformance.rating : '—'}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{s.openGrievanceCount}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.latestRecognition?.date || '—'}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.latestFeedback?.date || '—'}</td>
                  <td className="py-2 pr-4 text-slate-600">{s.leaveBalance.total}</td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1">
                      {s.flags.map((flag) => (
                        <StatusBadge key={flag} label={flag} />
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No employees match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <AddEmployeeModal onClose={() => setShowAddModal(false)} onCreated={loadData} />
      )}
    </Layout>
  )
}
