import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Avatar from '../components/Avatar.jsx'
import Modal from '../components/Modal.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getAllUsers, getAllRecords, setRecordById } from '../lib/firestoreHelpers.js'
import { isReview, latestByDate } from '../lib/aggregate.js'
import { isManagedBy } from '../lib/manager.js'
import { computeResourceRisk } from '../lib/resourceRisk.js'

// The happiness/risk COLOUR lives on the My Team dashboard; this tab is the
// notes workspace. Risk is still computed to sort at-risk people first, filter,
// and show textual "why" reasons.
const SENTIMENTS = [
  { key: 'positive', label: '🙂 Positive' },
  { key: 'neutral', label: '😐 Neutral' },
  { key: 'concern', label: '⚠️ Concern' },
]
const SENTIMENT_EMOJI = { positive: '🙂', neutral: '😐', concern: '⚠️' }
const RISK_ORDER = { red: 0, amber: 1, green: 2 }

export default function ResourceAnalysis() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const [editing, setEditing] = useState(null) // the row being edited

  const loadData = useCallback(async () => {
    setLoading(true)
    const [users, performance, grievances, recognitions, feedback, oneOnOnes, analysis] = await Promise.all([
      getAllUsers(),
      getAllRecords('performance'),
      getAllRecords('grievances'),
      getAllRecords('recognitions'),
      getAllRecords('feedback'),
      getAllRecords('oneOnOnes'),
      getAllRecords('resourceAnalysis'),
    ])
    setData({ users, performance, grievances, recognitions, feedback, oneOnOnes, analysis })
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const rows = useMemo(() => {
    if (!data) return []
    const admin = { uid: user.uid, name: profile?.name }
    const analysisById = Object.fromEntries(data.analysis.map((a) => [a.id, a]))
    const byEmp = (col, id) => data[col].filter((r) => r.employeeId === id)

    return data.users
      .filter((u) => u.role === 'employee' && isManagedBy(u, admin))
      .map((emp) => {
        const bundle = {
          performance: byEmp('performance', emp.id),
          grievances: byEmp('grievances', emp.id),
          recognitions: byEmp('recognitions', emp.id),
          feedback: byEmp('feedback', emp.id),
          oneOnOnes: byEmp('oneOnOnes', emp.id),
        }
        const analysis = analysisById[emp.id]
        return { emp, bundle, analysis, risk: computeResourceRisk(bundle, analysis) }
      })
      .sort((a, b) => RISK_ORDER[a.risk.level] - RISK_ORDER[b.risk.level] || a.emp.name.localeCompare(b.emp.name))
  }, [data, user.uid, profile?.name])

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.emp.department).filter(Boolean))].sort(),
    [rows],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.emp.name.toLowerCase().includes(q) && !(r.emp.department || '').toLowerCase().includes(q)) return false
      if (deptFilter && r.emp.department !== deptFilter) return false
      if (riskFilter && r.risk.level !== riskFilter) return false
      return true
    })
  }, [rows, search, deptFilter, riskFilter])

  async function saveAnalysis(empId, note, sentiment) {
    await setRecordById('resourceAnalysis', empId, {
      note,
      sentiment,
      updatedByUid: user.uid,
      updatedAt: new Date().toISOString(),
    })
    loadData()
  }

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner label="Analysing your team…" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Resource Analysis</h1>
        <p className="text-sm text-ink-muted">
          Your private notes on each reportee. These feed the happiness/risk colour shown on your{' '}
          <span className="text-ink">My Team</span> dashboard. Employees never see this.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 card text-center text-ink-faint">
          No employees are assigned to you yet. Assign reportees from the Dashboard, then they&apos;ll appear here.
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
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
            <span className="ml-auto text-sm text-ink-faint">{filtered.length} shown</span>
          </div>

          {filtered.length === 0 ? (
            <p className="mt-6 py-8 text-center text-ink-faint">No one matches these filters.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((row) => (
                <ResourceCard
                  key={row.emp.id}
                  row={row}
                  onOpen={() => navigate(`/employee/${row.emp.id}`)}
                  onEdit={() => setEditing(row)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <NoteModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={async (note, sentiment) => {
            await saveAnalysis(editing.emp.id, note, sentiment)
            setEditing(null)
          }}
        />
      )}
    </Layout>
  )
}

function ResourceCard({ row, onOpen, onEdit }) {
  const { emp, bundle, analysis } = row
  const reviews = bundle.performance.filter(isReview)
  const latestRating = reviews.length ? latestByDate(reviews, 'date').rating : '—'
  const openGrievances = bundle.grievances.filter((g) => g.status !== 'Resolved').length

  return (
    <div className="flex flex-col rounded-xl border border-surface-border p-3">
      <div className="flex items-start gap-2.5">
        <Avatar name={emp.name} colorKey={emp.id} size="md" />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onOpen} className="truncate font-semibold text-ink hover:underline">
            {emp.name}
          </button>
          <p className="truncate text-xs text-ink-muted">{emp.department || '—'}</p>
        </div>
        <span className="flex gap-3 text-center text-xs text-ink-muted">
          <span>
            <span className="block text-sm font-semibold text-ink">{latestRating === '—' ? '—' : `${latestRating}/5`}</span>
            <span className="text-[10px] uppercase text-ink-faint">Rating</span>
          </span>
          <span>
            <span className={`block text-sm font-semibold ${openGrievances > 0 ? 'text-rose-300' : 'text-ink'}`}>
              {openGrievances}
            </span>
            <span className="text-[10px] uppercase text-ink-faint">Griev.</span>
          </span>
        </span>
      </div>

      <div className="mt-2 flex-1 rounded-lg bg-black/10 p-2 text-sm text-ink-muted">
        {analysis?.note ? (
          <p className="line-clamp-3">
            {SENTIMENT_EMOJI[analysis.sentiment] || '📝'} “{analysis.note}”
          </p>
        ) : (
          <p className="text-ink-faint">No note yet.</p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="truncate text-[11px] text-ink-faint">
          {row.risk.reasons.slice(0, 1)[0] || ''}
          {analysis?.updatedAt ? ` · ${analysis.updatedAt.slice(0, 10)}` : ''}
        </span>
        <button type="button" onClick={onEdit} className="btn-secondary text-xs">
          {analysis?.note ? 'Edit note' : 'Add note'}
        </button>
      </div>
    </div>
  )
}

function NoteModal({ row, onClose, onSave }) {
  const { emp, analysis, risk } = row
  const [note, setNote] = useState(analysis?.note || '')
  const [sentiment, setSentiment] = useState(analysis?.sentiment || 'neutral')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave(note.trim(), sentiment)
    setSaving(false)
  }

  return (
    <Modal title={`Notes — ${emp.name}`} onClose={onClose}>
      <div className="space-y-4">
        {risk.reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {risk.reasons.map((r) => (
              <span key={r} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-ink-muted">
                {r}
              </span>
            ))}
          </div>
        )}
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Your private note (only you and other managers see this)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Your read on this person right now…"
            className="input mt-1 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {SENTIMENTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSentiment(s.key)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  sentiment === s.key ? 'bg-white/15 text-ink' : 'text-ink-muted hover:bg-white/5'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary text-xs">
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-ink-faint">
          A “Concern” note keeps the dashboard row red until you change it; grievance closures and positive updates lift
          the colour automatically.
        </p>
      </div>
    </Modal>
  )
}
