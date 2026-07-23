import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, CheckCircle2 } from 'lucide-react'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Modal from '../components/Modal.jsx'
import Section from '../components/Section.jsx'
import DataTable from '../components/DataTable.jsx'
import PerformanceTimeline from '../components/PerformanceTimeline.jsx'
import OneOnOnes from '../components/OneOnOnes.jsx'
import Goals from '../components/Goals.jsx'
import GrievanceList from '../components/GrievanceList.jsx'
import GrievanceEditModal from '../components/GrievanceEditModal.jsx'
import Avatar from '../components/Avatar.jsx'
import { GroupedBarChart, ColumnChart } from '../components/Charts.jsx'
import { LabeledInput, LabeledTextarea, FormActions } from '../components/FormFields.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  getRecordsForEmployee,
  getRecordsByField,
  getAllUsers,
  getAllRecords,
  addRecord,
  updateRecord,
  deleteRecord,
} from '../lib/firestoreHelpers.js'
import { computeLeaveBalance, sortByDateDesc, latestByDate, isReview } from '../lib/aggregate.js'
import { recognitionsByMonth } from '../lib/analytics.js'
import { formatBirthday, birthdayState } from '../lib/birthday.js'
import { computeLeaveDays, holidaySet } from '../lib/leave.js'
import { sendAlert, getAdminEmails } from '../lib/notify.js'
import {
  GRIEVANCE_CATEGORIES,
  LEAVE_TYPES,
  PEER_RECOGNITION_TYPES,
  LOW_LEAVE_BALANCE_THRESHOLD,
} from '../lib/constants.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// URL slug (/me/:section) -> internal view key. The section links themselves
// live in the app sidebar (Layout), nested beneath "My Dashboard"; /me itself
// shows the Overview (analytics + alerts).
const SLUG_TO_VIEW = {
  performance: 'performance',
  goals: 'goals',
  recognitions: 'recognitions',
  feedback: 'feedback',
  'one-on-ones': 'oneOnOnes',
  grievances: 'grievances',
  leave: 'leave',
}
const VIEW_TO_SLUG = Object.fromEntries(Object.entries(SLUG_TO_VIEW).map(([slug, v]) => [v, slug]))

export default function EmployeeDashboard() {
  const { user, profile } = useAuth()
  const { section } = useParams()
  const navigate = useNavigate()
  // Which section to render comes from the URL; unknown/absent -> Overview.
  const view = SLUG_TO_VIEW[section] || 'overview'
  const goTo = (v) => navigate(v === 'overview' || !VIEW_TO_SLUG[v] ? '/me' : `/me/${VIEW_TO_SLUG[v]}`)
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState({
    performance: [],
    grievances: [],
    recognitions: [],
    recognitionsGiven: [],
    feedback: [],
    leaves: [],
    holidays: [],
    goals: [],
  })
  const [modal, setModal] = useState(null) // 'grievance' | 'leave' | 'achievement' | 'recognition'
  const [editAchievement, setEditAchievement] = useState(null) // achievement record being edited
  const [editGrievance, setEditGrievance] = useState(null) // grievance record being edited

  async function deleteAchievement(record) {
    if (!window.confirm('Delete this achievement?')) return
    await deleteRecord('performance', record.id)
    loadData()
  }
  async function deleteGrievance(record) {
    if (!window.confirm('Delete this grievance? This cannot be undone.')) return
    await deleteRecord('grievances', record.id)
    loadData()
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    const [performance, grievances, recognitions, recognitionsGiven, feedback, leaves, holidays, goals] =
      await Promise.all([
        getRecordsForEmployee('performance', user.uid),
        getRecordsForEmployee('grievances', user.uid),
        getRecordsForEmployee('recognitions', user.uid),
        getRecordsByField('recognitions', 'givenByUid', user.uid),
        getRecordsForEmployee('feedback', user.uid),
        getRecordsForEmployee('leaves', user.uid),
        getAllRecords('holidays'),
        getRecordsForEmployee('goals', user.uid),
      ])
    setRecords({ performance, grievances, recognitions, recognitionsGiven, feedback, leaves, holidays, goals })
    setLoading(false)
  }, [user.uid])

  useEffect(() => {
    loadData()
  }, [loadData])

  const leaveBalance = useMemo(
    () => (profile ? computeLeaveBalance(profile, records.leaves) : null),
    [profile, records.leaves],
  )

  if (loading || !profile) {
    return (
      <Layout>
        <LoadingSpinner label="Loading your data…" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="card">
        <div className="flex items-center gap-4">
          <Avatar name={profile.name} colorKey={user.uid} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{profile.name}</h1>
            <p className="text-sm text-ink-muted">
              {profile.department} · 🎂 {formatBirthday(profile.birthday) || '—'} · Manager {profile.managerName || '—'}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            {
              label: 'Latest rating',
              value: (() => {
                const reviews = records.performance.filter(isReview)
                return reviews.length ? `${latestByDate(reviews, 'date').rating}/5` : '—'
              })(),
            },
            { label: 'Open grievances', value: records.grievances.filter((g) => g.status !== 'Resolved').length },
            { label: 'Leave balance', value: leaveBalance ? leaveBalance.total : '—' },
          ].map((c) => (
            <div key={c.label} className="rounded-lg bg-white/5 px-3 py-2 text-center">
              <p className="text-lg font-semibold text-ink">{c.value}</p>
              <p className="text-xs text-ink-muted">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Section content — which section is shown is driven by the app
          sidebar (Layout), where the sections sit beneath "My Dashboard". */}
      <div className="mt-6 space-y-6">
          {view === 'overview' && (
            <OverviewView records={records} leaveBalance={leaveBalance} profile={profile} onGoTo={goTo} />
          )}

          {view === 'performance' && (
            <Section title="My Performance & Achievements" onAdd={() => setModal('achievement')} addLabel="+ Add Achievement">
              <PerformanceTimeline
                records={records.performance}
                emptyText="No performance reviews or achievements logged yet."
                onEditAchievement={(r) => setEditAchievement(r)}
                onDelete={deleteAchievement}
                canDelete={(r) => r.entryType === 'Achievement'}
              />
            </Section>
          )}

          {view === 'goals' && (
            <Goals employeeId={user.uid} viewer={{ uid: user.uid, name: profile.name, role: 'employee' }} />
          )}

          {view === 'recognitions' && (
            <Section title="My Recognitions" onAdd={() => setModal('recognition')} addLabel="+ Give Recognition">
              <RecognitionsPanel received={records.recognitions} given={records.recognitionsGiven} />
            </Section>
          )}

          {view === 'feedback' && (
            <Section title="My Feedback">
              <DataTable
                headers={['Date', 'Type', 'Given By', 'Summary', 'Action Items', 'Follow-up']}
                rows={sortByDateDesc(records.feedback, 'date').map((r) => [
                  r.date,
                  r.type,
                  r.givenBy,
                  r.summary,
                  r.actionItems,
                  r.followUpDate,
                ])}
                emptyText="No feedback logged yet."
              />
            </Section>
          )}

          {view === 'oneOnOnes' && (
            <OneOnOnes
              employeeId={user.uid}
              viewer={{ uid: user.uid, name: profile.name, role: 'employee' }}
              canSchedule={false}
              employeeEmail={profile.email}
              employeeName={profile.name}
            />
          )}

          {view === 'grievances' && (
            <Section title="My Grievances" onAdd={() => setModal('grievance')} addLabel="+ Raise Grievance">
              <GrievanceList
                grievances={records.grievances}
                viewer={{ uid: user.uid, name: profile.name, role: 'employee' }}
                onEdit={(g) => setEditGrievance(g)}
                onDelete={deleteGrievance}
              />
            </Section>
          )}

          {view === 'leave' && (
            <>
              <Section title="Leave Balance">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {leaveBalance &&
                    Object.entries(leaveBalance.byType).map(([type, v]) => (
                      <div key={type} className="rounded-xl border border-surface-border bg-white/[0.03] p-3">
                        <p className="text-xs font-medium text-ink-muted">{type}</p>
                        <p className="mt-1 text-lg font-semibold text-mint">{v.balance}</p>
                        <p className="text-xs text-ink-faint">
                          {v.taken} taken / {v.entitlement} entitled
                        </p>
                        {v.carryOver > 0 && <p className="text-xs text-ink-faint">+{v.carryOver} carried over</p>}
                      </div>
                    ))}
                </div>
              </Section>

              <Section title="My Leave Requests" onAdd={() => setModal('leave')} addLabel="+ Request Leave">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-muted">
                        <th className="py-2 pr-4">Type</th>
                        <th className="py-2 pr-4">From</th>
                        <th className="py-2 pr-4">To</th>
                        <th className="py-2 pr-4">Days</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Approved By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortByDateDesc(records.leaves, 'dateFrom').map((r) => (
                        <tr key={r.id} className="border-b border-white/5">
                          <td className="py-2 pr-4">{r.leaveType}</td>
                          <td className="py-2 pr-4">{r.dateFrom}</td>
                          <td className="py-2 pr-4">{r.dateTo}</td>
                          <td className="py-2 pr-4">{r.numDays}</td>
                          <td className="py-2 pr-4">
                            <StatusBadge label={r.status} />
                          </td>
                          <td className="py-2 pr-4 text-ink-muted">{r.approvedBy || '—'}</td>
                        </tr>
                      ))}
                      {records.leaves.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-ink-faint">
                            No leave requests yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          )}
      </div>

      {modal === 'grievance' && (
        <GrievanceForm
          employeeId={user.uid}
          requesterName={profile.name}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal === 'leave' && (
        <LeaveForm
          employeeId={user.uid}
          requesterName={profile.name}
          holidays={records.holidays}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal === 'achievement' && (
        <AchievementForm employeeId={user.uid} onClose={() => setModal(null)} onSaved={loadData} />
      )}
      {editAchievement && (
        <AchievementForm
          employeeId={user.uid}
          record={editAchievement}
          onClose={() => setEditAchievement(null)}
          onSaved={loadData}
        />
      )}
      {editGrievance && (
        <GrievanceEditModal
          record={editGrievance}
          onClose={() => setEditGrievance(null)}
          onSaved={loadData}
        />
      )}
      {modal === 'recognition' && (
        <GiveRecognitionForm
          giverUid={user.uid}
          giverName={profile.name}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
    </Layout>
  )
}

function dotClass(tone) {
  return tone === 'red'
    ? 'bg-rose-400'
    : tone === 'amber'
      ? 'bg-amber-400'
      : tone === 'violet'
        ? 'bg-violet-400'
        : 'bg-emerald-400'
}

// The default landing: personal analytics + an actionable alerts/reminders feed.
// Each alert links to the relevant section via onGoTo.
function OverviewView({ records, leaveBalance, profile, onGoTo }) {
  const today = todayISO()
  const birthdayToday = birthdayState(profile?.birthday) === 'today'
  const firstName = (profile?.name || '').trim().split(/\s+/)[0] || 'there'

  const alerts = []
  const pending = records.leaves.filter((l) => l.status === 'Pending')
  if (pending.length)
    alerts.push({ tone: 'amber', text: `${pending.length} leave request${pending.length > 1 ? 's' : ''} awaiting approval`, view: 'leave' })

  const openGr = records.grievances.filter((g) => g.status !== 'Resolved')
  if (openGr.length)
    alerts.push({ tone: 'red', text: `${openGr.length} open grievance${openGr.length > 1 ? 's' : ''}`, view: 'grievances' })

  ;(records.goals || [])
    .filter((g) => g.status !== 'Completed' && g.dueDate && g.dueDate < today)
    .slice(0, 3)
    .forEach((g) => alerts.push({ tone: 'red', text: `Goal “${g.objective}” is overdue (was ${g.dueDate})`, view: 'goals' }))
  ;(records.goals || [])
    .filter((g) => g.status !== 'Completed' && g.dueDate && g.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3)
    .forEach((g) => alerts.push({ tone: 'green', text: `Goal “${g.objective}” due ${g.dueDate}`, view: 'goals' }))

  records.feedback
    .filter((f) => f.followUpDate && f.followUpDate >= today)
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate))
    .slice(0, 3)
    .forEach((f) => alerts.push({ tone: 'violet', text: `Feedback follow-up due ${f.followUpDate}`, view: 'feedback' }))

  if (leaveBalance)
    Object.entries(leaveBalance.byType).forEach(([type, v]) => {
      if (v.balance <= LOW_LEAVE_BALANCE_THRESHOLD)
        alerts.push({ tone: 'amber', text: `Low ${type} balance: ${v.balance} left`, view: 'leave' })
    })

  const reviews = records.performance.filter(isReview)
  const latest = reviews.length ? `${latestByDate(reviews, 'date').rating}/5` : '—'
  const goalsInProgress = (records.goals || []).filter((g) => g.status !== 'Completed').length
  const stats = [
    { label: 'Latest rating', value: latest },
    { label: 'Recognitions', value: records.recognitions.length },
    { label: 'Goals in progress', value: goalsInProgress },
    { label: 'Leave balance', value: leaveBalance ? leaveBalance.total : '—' },
  ]

  const leaveChart = leaveBalance
    ? Object.entries(leaveBalance.byType).map(([label, v]) => ({ label, taken: v.taken, entitled: v.entitlement }))
    : []
  const recByMonth = recognitionsByMonth(records.recognitions, 6)

  return (
    <div className="space-y-6">
      {birthdayToday && (
        <div
          className="animate-fade-in-up rounded-2xl border border-fuchsia-500/30 p-5"
          style={{ background: 'linear-gradient(120deg, rgba(196,107,255,.16), rgba(0,226,142,.14))' }}
        >
          <p className="text-lg font-bold text-ink">🎉 Happy Birthday, {firstName}! 🎂</p>
          <p className="mt-1 text-sm text-ink-muted">
            Wishing you a fantastic day and a wonderful year ahead — from the whole team at Cadence.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className="text-sm text-ink-muted">{s.label}</p>
            <p className="gradient-text mt-1 text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <Section title="Alerts & reminders">
        {alerts.length === 0 ? (
          <p className="flex items-center gap-2 py-3 text-sm text-ink-muted">
            <CheckCircle2 size={16} className="text-emerald-400" /> You&apos;re all caught up.
          </p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onGoTo(a.view)}
                  className="flex w-full items-center gap-3 rounded-lg border border-surface-border bg-white/[0.03] px-3 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.06]"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass(a.tone)}`} />
                  <span className="flex-1 text-ink">{a.text}</span>
                  <ChevronRight size={16} className="text-ink-faint" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Leave: taken vs entitlement">
          {leaveChart.length ? (
            <GroupedBarChart
              data={leaveChart}
              seriesA={{ key: 'taken', label: 'Taken', color: '#00C27A' }}
              seriesB={{ key: 'entitled', label: 'Entitled', color: '#64748B' }}
            />
          ) : (
            <p className="text-sm text-ink-faint">No leave data yet.</p>
          )}
        </Section>
        <Section title="Recognitions (last 6 months)">
          <ColumnChart data={recByMonth} />
        </Section>
      </div>
    </div>
  )
}

function RecognitionsPanel({ received, given }) {
  const [view, setView] = useState('received')
  const records = view === 'received' ? received : given

  return (
    <div>
      <div className="mb-3 flex gap-1 border-b border-surface-border">
        {[
          { key: 'received', label: 'Received' },
          { key: 'given', label: 'Given by you' },
        ].map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`px-3 py-1.5 text-sm font-medium ${
              view === v.key ? 'border-b-2 border-brand text-mint' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <DataTable
        headers={view === 'received' ? ['Date', 'Type', 'Description', 'Given By'] : ['Date', 'Type', 'Description', 'Given To']}
        rows={sortByDateDesc(records, 'date').map((r) => [
          r.date,
          r.type,
          r.description,
          view === 'received' ? r.givenBy : r.recipientName || r.employeeId,
        ])}
        emptyText={view === 'received' ? 'No recognitions received yet.' : "You haven't given any recognitions yet."}
      />
    </div>
  )
}

function GiveRecognitionForm({ giverUid, giverName, onClose, onSaved }) {
  const [teammates, setTeammates] = useState([])
  const [loadingTeammates, setLoadingTeammates] = useState(true)
  const [recipientId, setRecipientId] = useState('')
  const [type, setType] = useState(PEER_RECOGNITION_TYPES[0])
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getAllUsers().then((users) => {
      setTeammates(users.filter((u) => u.id !== giverUid))
      setLoadingTeammates(false)
    })
  }, [giverUid])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!recipientId) return
    setSubmitting(true)
    const recipient = teammates.find((t) => t.id === recipientId)
    await addRecord('recognitions', {
      employeeId: recipientId,
      recipientName: recipient?.name || '',
      givenByUid: giverUid,
      givenBy: giverName,
      date: todayISO(),
      type,
      description,
      source: 'peer',
      sharedPublicly: false,
    })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Give Recognition" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-ink">Teammate</span>
          <select
            required
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            className="input mt-1"
            disabled={loadingTeammates}
          >
            <option value="">{loadingTeammates ? 'Loading…' : 'Select a teammate'}</option>
            {teammates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value)} className="input mt-1">
            {PEER_RECOGNITION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <LabeledTextarea label="Description" required value={description} onChange={setDescription} />
        <FormActions submitting={submitting || !recipientId} onCancel={onClose} submitLabel="Give Recognition" />
      </form>
    </Modal>
  )
}

function AchievementForm({ employeeId, record, onClose, onSaved }) {
  const [date, setDate] = useState(record?.date || todayISO())
  const [title, setTitle] = useState(record?.title || '')
  const [description, setDescription] = useState(record?.description || '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    if (record) {
      await updateRecord('performance', record.id, { date, title, description })
    } else {
      await addRecord('performance', {
        employeeId,
        entryType: 'Achievement',
        date,
        title,
        description,
      })
    }
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title={record ? 'Edit Achievement' : 'Add Achievement'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LabeledInput label="Date" type="date" required value={date} onChange={setDate} />
        <LabeledInput label="Title" required value={title} onChange={setTitle} placeholder="e.g. Shipped the Q3 migration" />
        <LabeledTextarea label="Description" value={description} onChange={setDescription} />
        <FormActions submitting={submitting} onCancel={onClose} submitLabel="Submit" />
      </form>
    </Modal>
  )
}

function GrievanceForm({ employeeId, requesterName, onClose, onSaved }) {
  const [category, setCategory] = useState(GRIEVANCE_CATEGORIES[0])
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await addRecord('grievances', {
      employeeId,
      dateRaised: todayISO(),
      category,
      description,
      status: 'Open',
    })
    getAdminEmails().then((admins) =>
      sendAlert({
        to: admins,
        subject: `New grievance raised by ${requesterName || 'an employee'}`,
        text: `${requesterName || 'An employee'} raised a ${category} grievance in Cadence.\n\nLog in to review and assign it.`,
      }),
    )
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Raise a Grievance" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-ink">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input mt-1">
            {GRIEVANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <LabeledTextarea label="Description" required value={description} onChange={setDescription} />
        <FormActions submitting={submitting} onCancel={onClose} submitLabel="Submit" />
      </form>
    </Modal>
  )
}

function LeaveForm({ employeeId, requesterName, holidays = [], onClose, onSaved }) {
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [halfDay, setHalfDay] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const holidays_ = useMemo(() => holidaySet(holidays), [holidays])
  const singleDay = dateFrom && dateFrom === dateTo
  // Half day only makes sense for a single-day request.
  const effectiveHalfDay = halfDay && singleDay
  const numDays = useMemo(
    () => computeLeaveDays({ dateFrom, dateTo, halfDay: effectiveHalfDay }, holidays_),
    [dateFrom, dateTo, effectiveHalfDay, holidays_],
  )

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await addRecord('leaves', {
      employeeId,
      leaveType,
      dateFrom,
      dateTo,
      numDays,
      halfDay: effectiveHalfDay,
      status: 'Pending',
    })
    getAdminEmails().then((admins) =>
      sendAlert({
        to: admins,
        subject: `New leave request from ${requesterName || 'an employee'}`,
        text: `${requesterName || 'An employee'} requested ${leaveType} (${dateFrom} → ${dateTo}, ${numDays} day${numDays === 1 ? '' : 's'}) in Cadence.\n\nLog in to approve or reject it.`,
      }),
    )
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Request Leave" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-ink">Leave Type</span>
          <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="input mt-1">
            {LEAVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="From" type="date" required value={dateFrom} onChange={setDateFrom} />
          <LabeledInput label="To" type="date" required value={dateTo} onChange={setDateTo} />
        </div>
        {singleDay && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-mint"
              checked={halfDay}
              onChange={(e) => setHalfDay(e.target.checked)}
            />
            <span className="text-ink">Half day</span>
          </label>
        )}
        <p className="text-sm text-ink-muted">
          Working days (excl. weekends &amp; holidays):{' '}
          <span className="font-medium text-ink">{numDays}</span>
        </p>
        <FormActions submitting={submitting || numDays === 0} onCancel={onClose} submitLabel="Submit" />
      </form>
    </Modal>
  )
}
