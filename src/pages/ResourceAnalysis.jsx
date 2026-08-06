import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Avatar from '../components/Avatar.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getAllUsers, getAllRecords, setRecordById } from '../lib/firestoreHelpers.js'
import { isReview, latestByDate, sortByDateDesc } from '../lib/aggregate.js'
import { isManagedBy } from '../lib/manager.js'
import { computeResourceRisk } from '../lib/resourceRisk.js'

const LEVEL_ROW = {
  red: 'border-rose-500 bg-rose-500/10',
  amber: 'border-amber-500 bg-amber-500/10',
  green: 'border-emerald-500 bg-emerald-500/[0.07]',
}
const LEVEL_DOT = { red: 'bg-rose-400', amber: 'bg-amber-400', green: 'bg-emerald-400' }
const LEVEL_LABEL = { red: 'At risk', amber: 'Watch', green: 'Healthy' }

const SENTIMENTS = [
  { key: 'positive', label: '🙂 Positive' },
  { key: 'neutral', label: '😐 Neutral' },
  { key: 'concern', label: '⚠️ Concern' },
]

export default function ResourceAnalysis() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

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
        const risk = computeResourceRisk(bundle, analysis)
        return { emp, bundle, analysis, risk }
      })
      .sort((a, b) => {
        const order = { red: 0, amber: 1, green: 2 }
        return order[a.risk.level] - order[b.risk.level] || a.emp.name.localeCompare(b.emp.name)
      })
  }, [data, user.uid, profile?.name])

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

  const counts = rows.reduce((acc, r) => ((acc[r.risk.level] = (acc[r.risk.level] || 0) + 1), acc), {})

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Resource Analysis</h1>
          <p className="text-sm text-ink-muted">
            Your private read on each reportee — auto colour-coded from grievances, performance, recognitions, 1:1s and
            your notes. Employees never see this.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          {['red', 'amber', 'green'].map((lvl) => (
            <span key={lvl} className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[lvl]}`} />
              {LEVEL_LABEL[lvl]} · {counts[lvl] || 0}
            </span>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 card text-center text-ink-faint">
          No employees are assigned to you yet. Assign reportees from the Dashboard, then they&apos;ll appear here.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((row) => (
            <ResourceRow
              key={row.emp.id}
              row={row}
              onOpen={() => navigate(`/employee/${row.emp.id}`)}
              onSave={saveAnalysis}
            />
          ))}
        </div>
      )}
    </Layout>
  )
}

function ResourceRow({ row, onOpen, onSave }) {
  const { emp, bundle, analysis, risk } = row
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState(analysis?.note || '')
  const [sentiment, setSentiment] = useState(analysis?.sentiment || 'neutral')
  const [saving, setSaving] = useState(false)

  const reviews = bundle.performance.filter(isReview)
  const latestRating = reviews.length ? latestByDate(reviews, 'date').rating : '—'
  const openGrievances = bundle.grievances.filter((g) => g.status !== 'Resolved').length
  const last1on1 = bundle.oneOnOnes.length ? sortByDateDesc(bundle.oneOnOnes, 'date')[0].date : '—'

  const dirty = note !== (analysis?.note || '') || sentiment !== (analysis?.sentiment || 'neutral')

  async function handleSave() {
    setSaving(true)
    await onSave(emp.id, note.trim(), sentiment)
    setSaving(false)
  }

  return (
    <div className={`overflow-hidden rounded-xl border-l-4 ${LEVEL_ROW[risk.level]}`}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <Avatar name={emp.name} colorKey={emp.id} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onOpen} className="truncate font-semibold text-ink hover:underline">
              {emp.name}
            </button>
            <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_DOT[risk.level]}`} title={LEVEL_LABEL[risk.level]} />
          </div>
          <p className="truncate text-xs text-ink-muted">
            {emp.department} · {risk.reasons.slice(0, 2).join(' · ')}
          </p>
        </div>
        <div className="hidden gap-4 text-center text-xs text-ink-muted sm:flex">
          <Metric label="Rating" value={latestRating === '—' ? '—' : `${latestRating}/5`} />
          <Metric label="Open griev." value={openGrievances} warn={openGrievances > 0} />
          <Metric label="Last 1:1" value={last1on1} />
        </div>
        <button type="button" onClick={() => setExpanded((v) => !v)} className="btn-secondary text-xs">
          {expanded ? 'Close' : analysis?.note ? 'Notes' : 'Add note'}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-white/10 bg-black/10 p-3">
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
              rows={3}
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
            <button type="button" onClick={handleSave} disabled={saving || !dirty} className="btn-primary text-xs">
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
          <p className="text-[11px] text-ink-faint">
            A “Concern” note keeps the row red until you change it; grievance closures and positive updates lift the
            colour automatically.
          </p>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, warn }) {
  return (
    <div>
      <p className={`text-sm font-semibold ${warn ? 'text-rose-300' : 'text-ink'}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-ink-faint">{label}</p>
    </div>
  )
}
