import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase.js'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Modal from '../components/Modal.jsx'
import Section from '../components/Section.jsx'
import DataTable from '../components/DataTable.jsx'
import PerformanceTimeline from '../components/PerformanceTimeline.jsx'
import ComposeEmailModal from '../components/ComposeEmailModal.jsx'
import EditLeaveModal from '../components/EditLeaveModal.jsx'
import OneOnOnes from '../components/OneOnOnes.jsx'
import Goals from '../components/Goals.jsx'
import GrievanceList from '../components/GrievanceList.jsx'
import Avatar from '../components/Avatar.jsx'
import { LabeledInput, LabeledTextarea, FormActions } from '../components/FormFields.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  getUserDoc,
  getRecordsForEmployee,
  addRecord,
  updateRecord,
  deleteRecord,
  updateUserProfile,
} from '../lib/firestoreHelpers.js'
import { formatBirthday, normalizeBirthday } from '../lib/birthday.js'
import BirthdayField from '../components/BirthdayField.jsx'
import { sendAlert } from '../lib/notify.js'
import GrievanceEditModal from '../components/GrievanceEditModal.jsx'
import { computeLeaveBalance, sortByDateDesc, latestByDate, isReview } from '../lib/aggregate.js'
import { GRIEVANCE_STATUSES, GRIEVANCE_PRIORITIES, FEEDBACK_TYPES, RECOGNITION_TYPES } from '../lib/constants.js'
import {
  performanceSummaryLine,
  grievanceSummaryLine,
  recognitionSummaryLine,
  feedbackSummaryLine,
  leaveSummaryLine,
} from '../lib/summaryLines.js'

const TABS = ['Performance', 'Goals', 'Grievances', 'Recognitions', 'Feedback', 'Leave', '1:1s']
const TAB_LABELS = { Performance: 'Performance & Achievements', '1:1s': '1:1 Meetings' }

export default function EmployeeDetail() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const { profile: adminProfile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [employee, setEmployee] = useState(null)
  const [records, setRecords] = useState({
    performance: [],
    grievances: [],
    recognitions: [],
    feedback: [],
    leaves: [],
  })
  const [tab, setTab] = useState('Performance')
  const [modal, setModal] = useState(null) // { type: 'add-performance' | ... , data? }
  // Selection persists across tab switches so an email can span multiple record types.
  const [selected, setSelected] = useState({}) // id -> { id, collection, summary }

  const selectedItems = useMemo(() => Object.values(selected), [selected])
  const selectedIdsByCollection = useMemo(() => {
    const map = { performance: new Set(), grievances: new Set(), recognitions: new Set(), feedback: new Set(), leaves: new Set() }
    for (const item of Object.values(selected)) map[item.collection]?.add(item.id)
    return map
  }, [selected])

  const makeToggle = useCallback(
    (collection, summarize) => (record) => {
      setSelected((prev) => {
        if (prev[record.id]) {
          const next = { ...prev }
          delete next[record.id]
          return next
        }
        return { ...prev, [record.id]: { id: record.id, collection, summary: summarize(record) } }
      })
    },
    [],
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    const [user, performance, grievances, recognitions, feedback, leaves] = await Promise.all([
      getUserDoc(uid),
      getRecordsForEmployee('performance', uid),
      getRecordsForEmployee('grievances', uid),
      getRecordsForEmployee('recognitions', uid),
      getRecordsForEmployee('feedback', uid),
      getRecordsForEmployee('leaves', uid),
    ])
    setEmployee(user)
    setRecords({ performance, grievances, recognitions, feedback, leaves })
    setLoading(false)
  }, [uid])

  useEffect(() => {
    loadData()
  }, [loadData])

  const leaveBalance = useMemo(
    () => (employee ? computeLeaveBalance(employee, records.leaves) : null),
    [employee, records.leaves],
  )

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner label="Loading employee…" />
      </Layout>
    )
  }

  if (!employee) {
    return (
      <Layout>
        <p className="text-ink-muted">Employee not found.</p>
        <Link to="/" className="text-mint underline">
          Back to dashboard
        </Link>
      </Layout>
    )
  }

  return (
    <Layout>
      <button type="button" onClick={() => navigate('/')} className="text-sm text-mint hover:underline">
        ← Back to roster
      </button>

      <ProfileHeader
        employee={employee}
        records={records}
        leaveBalance={leaveBalance}
        onDeleted={() => navigate('/')}
        onChanged={loadData}
      />

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-surface-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 px-4 py-2 text-sm font-medium ${
              tab === t
                ? 'border-b-2 border-brand text-mint'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {TAB_LABELS[t] || t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'Performance' && (
          <PerformanceTab
            records={records.performance}
            adminName={adminProfile?.name}
            onAdd={() => setModal({ type: 'add-performance' })}
            onEditAchievement={(r) => setModal({ type: 'edit-achievement', data: r })}
            onDelete={async (r) => {
              if (window.confirm('Delete this entry?')) {
                await deleteRecord('performance', r.id)
                loadData()
              }
            }}
            selectedIds={selectedIdsByCollection.performance}
            onToggle={makeToggle('performance', performanceSummaryLine)}
          />
        )}
        {tab === 'Grievances' && (
          <GrievancesTab
            records={records.grievances}
            viewer={{ uid: adminProfile?.id, name: adminProfile?.name, role: 'admin' }}
            onUpdate={(rec) => setModal({ type: 'update-grievance', data: rec })}
            onEdit={(rec) => setModal({ type: 'edit-grievance', data: rec })}
            onDelete={async (rec) => {
              if (window.confirm('Delete this grievance? This cannot be undone.')) {
                await deleteRecord('grievances', rec.id)
                loadData()
              }
            }}
            selectedIds={selectedIdsByCollection.grievances}
            onToggle={makeToggle('grievances', grievanceSummaryLine)}
          />
        )}
        {tab === 'Recognitions' && (
          <RecognitionsTab
            records={records.recognitions}
            adminName={adminProfile?.name}
            onAdd={() => setModal({ type: 'add-recognition' })}
            selectedIds={selectedIdsByCollection.recognitions}
            onToggle={makeToggle('recognitions', recognitionSummaryLine)}
          />
        )}
        {tab === 'Feedback' && (
          <FeedbackTab
            records={records.feedback}
            adminName={adminProfile?.name}
            onAdd={() => setModal({ type: 'add-feedback' })}
            onEdit={(rec) => setModal({ type: 'edit-feedback', data: rec })}
            onDelete={async (rec) => {
              if (window.confirm('Delete this feedback entry?')) {
                await deleteRecord('feedback', rec.id)
                loadData()
              }
            }}
            selectedIds={selectedIdsByCollection.feedback}
            onToggle={makeToggle('feedback', feedbackSummaryLine)}
          />
        )}
        {tab === 'Leave' && (
          <LeaveTab
            balance={leaveBalance}
            records={records.leaves}
            adminName={adminProfile?.name}
            onApprove={(rec) => setModal({ type: 'decide-leave', data: rec, decision: 'Approved' })}
            onReject={(rec) => setModal({ type: 'decide-leave', data: rec, decision: 'Rejected' })}
            selectedIds={selectedIdsByCollection.leaves}
            onToggle={makeToggle('leaves', leaveSummaryLine)}
            onEditBalance={() => setModal({ type: 'edit-leave' })}
          />
        )}
        {tab === 'Goals' && (
          <Goals employeeId={uid} viewer={{ uid: adminProfile?.id, name: adminProfile?.name, role: 'admin' }} />
        )}
        {tab === '1:1s' && (
          <OneOnOnes
            employeeId={uid}
            viewer={{ uid: adminProfile?.id, name: adminProfile?.name, role: 'admin' }}
            canSchedule
            employeeEmail={employee.email}
            employeeName={employee.name}
          />
        )}
      </div>

      {selectedItems.length > 0 && (
        <div className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-2 p-3 shadow-lg">
          <span className="text-sm font-medium text-ink">
            {selectedItems.length} item{selectedItems.length === 1 ? '' : 's'} selected across tabs
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSelected({})} className="btn-secondary text-xs">
              Clear
            </button>
            <button type="button" onClick={() => setModal({ type: 'compose-email' })} className="btn-primary text-xs">
              ✉ Compose Email
            </button>
          </div>
        </div>
      )}

      {modal?.type === 'add-performance' && (
        <PerformanceForm
          employeeId={uid}
          employee={employee}
          defaultReviewer={adminProfile?.name}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal?.type === 'add-recognition' && (
        <RecognitionForm
          employeeId={uid}
          defaultGivenBy={adminProfile?.name}
          adminUid={adminProfile?.id}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal?.type === 'add-feedback' && (
        <FeedbackForm
          employeeId={uid}
          employee={employee}
          defaultGivenBy={adminProfile?.name}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal?.type === 'edit-feedback' && (
        <FeedbackForm
          employeeId={uid}
          employee={employee}
          record={modal.data}
          defaultGivenBy={adminProfile?.name}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal?.type === 'edit-achievement' && (
        <AchievementEditForm record={modal.data} onClose={() => setModal(null)} onSaved={loadData} />
      )}
      {modal?.type === 'edit-grievance' && (
        <GrievanceEditModal record={modal.data} onClose={() => setModal(null)} onSaved={loadData} />
      )}
      {modal?.type === 'update-grievance' && (
        <GrievanceUpdateForm
          record={modal.data}
          employee={employee}
          defaultResolvedBy={adminProfile?.name}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal?.type === 'decide-leave' && (
        <LeaveDecisionModal
          record={modal.data}
          employee={employee}
          decision={modal.decision}
          adminName={adminProfile?.name}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal?.type === 'compose-email' && (
        <ComposeEmailModal employee={employee} items={selectedItems} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'edit-leave' && (
        <EditLeaveModal
          employee={employee}
          leaveRecords={records.leaves}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
    </Layout>
  )
}

// --- Profile header ----------------------------------------------------

function ProfileHeader({ employee, records, leaveBalance, onDeleted, onChanged }) {
  const [editingBirthday, setEditingBirthday] = useState(false)
  const reviews = records.performance.filter(isReview)
  const latestReview = reviews.length ? latestByDate(reviews, 'date') : null
  const openGrievances = records.grievances.filter((g) => g.status !== 'Resolved').length

  const chips = [
    { label: 'Latest rating', value: latestReview ? `${latestReview.rating}/5` : '—' },
    { label: 'Open grievances', value: openGrievances },
    { label: 'Leave balance', value: leaveBalance ? leaveBalance.total : '—' },
  ]

  return (
    <div className="mt-2 card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={employee.name} colorKey={employee.id || employee.name} size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-ink">{employee.name}</h1>
            <p className="truncate text-sm text-ink-muted">{employee.email}</p>
            <p className="text-sm text-ink-muted">
              {employee.department} · 🎂 {formatBirthday(employee.birthday) || 'Not set'}{' '}
              <button
                type="button"
                onClick={() => setEditingBirthday(true)}
                className="text-xs text-mint hover:underline"
              >
                edit
              </button>{' '}
              · Manager {employee.managerName || '—'}
            </p>
          </div>
        </div>
        <AdminEmployeeActions employee={employee} onDeleted={onDeleted} />
      </div>

      {editingBirthday && (
        <SetBirthdayModal employee={employee} onClose={() => setEditingBirthday(false)} onSaved={onChanged} />
      )}

      <div className="mt-4 grid grid-cols-3 gap-3">
        {chips.map((c) => (
          <div key={c.label} className="rounded-lg bg-white/5 px-3 py-2 text-center">
            <p className="text-lg font-semibold text-ink">{c.value}</p>
            <p className="text-xs text-ink-muted">{c.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SetBirthdayModal({ employee, onClose, onSaved }) {
  const [birthday, setBirthday] = useState(employee.birthday || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const clean = normalizeBirthday(birthday)
    if (birthday && !clean) return setError('Pick both a day and a month.')
    setSubmitting(true)
    try {
      await updateUserProfile(employee.id, { birthday: clean })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save birthday.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Birthday — ${employee.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          Only the day and month are stored — the year of birth is never collected.
        </p>
        <BirthdayField value={birthday} onChange={setBirthday} />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// --- Performance -------------------------------------------------------

// Small checkbox cell used by the selectable tables below.
function SelectCell({ record, selectedIds, onToggle }) {
  return (
    <td className="py-2 pr-2">
      <input
        type="checkbox"
        className="h-4 w-4 accent-mint"
        checked={!!selectedIds?.has(record.id)}
        onChange={() => onToggle?.(record)}
        aria-label="Select row"
      />
    </td>
  )
}

function PerformanceTab({ records, onAdd, onEditAchievement, onDelete, selectedIds, onToggle }) {
  return (
    <Section title="Performance & Achievements" onAdd={onAdd} addLabel="+ Add Review">
      <PerformanceTimeline
        records={records}
        emptyText="No performance reviews or achievements logged yet."
        selectable
        selectedIds={selectedIds}
        onToggle={onToggle}
        onEditAchievement={onEditAchievement}
        onDelete={onDelete}
        canDelete={() => true}
      />
    </Section>
  )
}

function PerformanceForm({ employeeId, employee, defaultReviewer, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: '',
    reviewPeriod: '',
    rating: 3,
    reviewer: defaultReviewer || '',
    comments: '',
    goals: '',
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await addRecord('performance', { employeeId, entryType: 'Review', ...form, rating: Number(form.rating) })
    sendAlert({
      to: employee?.email,
      subject: 'A new performance review was added',
      text: `Hi ${employee?.name || ''},\n\nA performance review for ${form.reviewPeriod} (rating ${form.rating}/5) has been logged in Cadence by ${form.reviewer}.\n\nLog in to view the details.`,
    })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Add Performance Review" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="Date" type="date" required value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
          <LabeledInput label="Review Period" required value={form.reviewPeriod} onChange={(v) => setForm((f) => ({ ...f, reviewPeriod: v }))} placeholder="e.g. H1 2026" />
          <label className="block text-sm">
            <span className="font-medium text-ink">Rating (1-5)</span>
            <select
              value={form.rating}
              onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))}
              className="input mt-1"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <LabeledInput label="Reviewer" required value={form.reviewer} onChange={(v) => setForm((f) => ({ ...f, reviewer: v }))} />
        </div>
        <LabeledTextarea label="Comments" value={form.comments} onChange={(v) => setForm((f) => ({ ...f, comments: v }))} />
        <LabeledTextarea label="Goals" value={form.goals} onChange={(v) => setForm((f) => ({ ...f, goals: v }))} />
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// Edit an existing self-logged achievement (admin or the owning employee).
function AchievementEditForm({ record, onClose, onSaved }) {
  const [date, setDate] = useState(record.date || '')
  const [title, setTitle] = useState(record.title || '')
  const [description, setDescription] = useState(record.description || '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await updateRecord('performance', record.id, { date, title, description })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Edit Achievement" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LabeledInput label="Date" type="date" required value={date} onChange={setDate} />
        <LabeledInput label="Title" required value={title} onChange={setTitle} />
        <LabeledTextarea label="Description" value={description} onChange={setDescription} />
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// --- Grievances ----------------------------------------------------------

function GrievancesTab({ records, viewer, onUpdate, onEdit, onDelete, selectedIds, onToggle }) {
  return (
    <Section title="Grievances">
      <GrievanceList
        grievances={records}
        viewer={viewer}
        onUpdate={onUpdate}
        onEdit={onEdit}
        onDelete={onDelete}
        selectedIds={selectedIds}
        onToggle={onToggle}
      />
    </Section>
  )
}

function GrievanceUpdateForm({ record, employee, defaultResolvedBy, onClose, onSaved }) {
  const [status, setStatus] = useState(record.status)
  const [priority, setPriority] = useState(record.priority || 'Medium')
  const [assignee, setAssignee] = useState(record.assignee || defaultResolvedBy || '')
  const [resolutionDate, setResolutionDate] = useState(record.resolutionDate || '')
  const [resolvedBy, setResolvedBy] = useState(record.resolvedBy || defaultResolvedBy || '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const data = { status, priority, assignee }
    if (status === 'Resolved') {
      data.resolutionDate = resolutionDate
      data.resolvedBy = resolvedBy
    }
    await updateRecord('grievances', record.id, data)
    if (status !== record.status) {
      sendAlert({
        to: employee?.email,
        subject: `Your grievance is now "${status}"`,
        text: `Hi ${employee?.name || ''},\n\nThe status of your grievance (${record.category}) changed to "${status}" in Cadence.\n\nLog in to view the details or add a comment.`,
      })
    }
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Update Grievance" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-ink-muted">{record.description}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-ink">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="input mt-1">
              {GRIEVANCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input mt-1">
              {GRIEVANCE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <LabeledInput label="Assignee" value={assignee} onChange={setAssignee} placeholder="Who's handling this?" />
        <p className="text-xs text-ink-faint">
          Target resolution is derived from priority (High 7d · Medium 14d · Low 30d) from the date raised.
        </p>
        {status === 'Resolved' && (
          <>
            <LabeledInput label="Resolution Date" type="date" required value={resolutionDate} onChange={setResolutionDate} />
            <LabeledInput label="Resolved By" required value={resolvedBy} onChange={setResolvedBy} />
          </>
        )}
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// --- Recognitions --------------------------------------------------------

function RecognitionsTab({ records, onAdd, selectedIds, onToggle }) {
  const sorted = sortByDateDesc(records, 'date')
  return (
    <Section title="Recognitions" onAdd={onAdd} addLabel="+ Add Recognition">
      <DataTable
        headers={['Date', 'Type', 'Description', 'Given By', 'Source', 'Shared Publicly']}
        rows={sorted.map((r) => [
          r.date,
          r.type,
          r.description,
          r.givenBy,
          r.source === 'peer' ? 'Peer' : 'Admin',
          r.sharedPublicly ? 'Yes' : 'No',
        ])}
        emptyText="No recognitions logged yet."
        selectable
        records={sorted}
        selectedIds={selectedIds}
        onToggle={onToggle}
      />
    </Section>
  )
}

function RecognitionForm({ employeeId, defaultGivenBy, adminUid, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: '',
    type: RECOGNITION_TYPES[0],
    description: '',
    givenBy: defaultGivenBy || '',
    sharedPublicly: false,
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await addRecord('recognitions', { employeeId, ...form, givenByUid: adminUid, source: 'admin' })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Add Recognition" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="Date" type="date" required value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
          <label className="block text-sm">
            <span className="font-medium text-ink">Type</span>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input mt-1">
              {RECOGNITION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <LabeledInput label="Given By" required value={form.givenBy} onChange={(v) => setForm((f) => ({ ...f, givenBy: v }))} />
          <label className="flex items-center gap-2 text-sm pt-6">
            <input
              type="checkbox"
              checked={form.sharedPublicly}
              onChange={(e) => setForm((f) => ({ ...f, sharedPublicly: e.target.checked }))}
            />
            <span className="font-medium text-ink">Shared publicly</span>
          </label>
        </div>
        <LabeledTextarea label="Description" required value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} />
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// --- Feedback --------------------------------------------------------------

function FeedbackTab({ records, onAdd, onEdit, onDelete, selectedIds, onToggle }) {
  const sorted = sortByDateDesc(records, 'date')
  return (
    <Section title="Feedback" onAdd={onAdd} addLabel="+ Add Feedback">
      <DataTable
        headers={['Date', 'Type', 'Given By', 'Summary', 'Action Items', 'Follow-up']}
        rows={sorted.map((r) => [r.date, r.type, r.givenBy, r.summary, r.actionItems, r.followUpDate])}
        emptyText="No feedback logged yet."
        selectable
        records={sorted}
        selectedIds={selectedIds}
        onToggle={onToggle}
        rowActions={(rec) => (
          <span className="flex gap-3">
            <button type="button" onClick={() => onEdit(rec)} className="text-xs text-ink-muted hover:text-mint hover:underline">
              Edit
            </button>
            <button type="button" onClick={() => onDelete(rec)} className="text-xs text-ink-faint hover:text-rose-400 hover:underline">
              Delete
            </button>
          </span>
        )}
      />
    </Section>
  )
}

function FeedbackForm({ employeeId, employee, record, defaultGivenBy, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: record?.date || '',
    type: record?.type || FEEDBACK_TYPES[0],
    givenBy: record?.givenBy || defaultGivenBy || '',
    summary: record?.summary || '',
    actionItems: record?.actionItems || '',
    followUpDate: record?.followUpDate || '',
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    if (record) {
      await updateRecord('feedback', record.id, { ...form })
    } else {
      await addRecord('feedback', { employeeId, ...form })
      sendAlert({
        to: employee?.email,
        subject: 'New feedback was shared with you',
        text: `Hi ${employee?.name || ''},\n\n${form.givenBy} added ${form.type} feedback in Cadence.\n\nLog in to read it.`,
      })
    }
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title={record ? 'Edit Feedback' : 'Add Feedback'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="Date" type="date" required value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
          <label className="block text-sm">
            <span className="font-medium text-ink">Type</span>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input mt-1">
              {FEEDBACK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <LabeledInput label="Given By" required value={form.givenBy} onChange={(v) => setForm((f) => ({ ...f, givenBy: v }))} />
          <LabeledInput label="Follow-up Date" type="date" value={form.followUpDate} onChange={(v) => setForm((f) => ({ ...f, followUpDate: v }))} />
        </div>
        <LabeledTextarea label="Summary" required value={form.summary} onChange={(v) => setForm((f) => ({ ...f, summary: v }))} />
        <LabeledTextarea label="Action Items" value={form.actionItems} onChange={(v) => setForm((f) => ({ ...f, actionItems: v }))} />
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// --- Leave -----------------------------------------------------------------

function LeaveTab({ balance, records, onApprove, onReject, selectedIds, onToggle, onEditBalance }) {
  const sorted = sortByDateDesc(records, 'dateFrom')
  return (
    <div className="space-y-6">
      <Section title="Leave Balance" onAdd={onEditBalance} addLabel="Edit entitlements">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {balance &&
            Object.entries(balance.byType).map(([type, v]) => (
              <div key={type} className="card">
                <p className="text-xs font-medium text-ink-muted">{type}</p>
                <p className="mt-1 text-lg font-semibold text-mint">{v.balance}</p>
                <p className="text-xs text-ink-faint">
                  {v.taken} taken / {v.entitlement} entitled
                </p>
                {v.takenBefore > 0 && (
                  <p className="text-xs text-ink-faint">
                    ({v.takenBefore} before Cadence, {v.takenInApp} logged here)
                  </p>
                )}
                {v.carryOver > 0 && <p className="text-xs text-ink-faint">+{v.carryOver} carried over</p>}
              </div>
            ))}
        </div>
      </Section>

      <Section title="Leave Log">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-muted">
                <th className="py-2 pr-2"></th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">From</th>
                <th className="py-2 pr-4">To</th>
                <th className="py-2 pr-4">Days</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Approved By</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-white/5">
                  <SelectCell record={r} selectedIds={selectedIds} onToggle={onToggle} />
                  <td className="py-2 pr-4">{r.leaveType}</td>
                  <td className="py-2 pr-4">{r.dateFrom}</td>
                  <td className="py-2 pr-4">{r.dateTo}</td>
                  <td className="py-2 pr-4">{r.numDays}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge label={r.status} />
                  </td>
                  <td className="py-2 pr-4 text-ink-muted">{r.approvedBy || '—'}</td>
                  <td className="py-2 pr-4">
                    {r.status === 'Pending' && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => onApprove(r)} className="text-emerald-300 hover:underline">
                          Approve
                        </button>
                        <button type="button" onClick={() => onReject(r)} className="text-rose-300 hover:underline">
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-ink-faint">
                    No leave requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

function LeaveDecisionModal({ record, employee, decision, adminName, onClose, onSaved }) {
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setSubmitting(true)
    await updateRecord('leaves', record.id, { status: decision, approvedBy: adminName || '' })
    sendAlert({
      to: employee?.email,
      subject: `Your leave request was ${decision.toLowerCase()}`,
      text: `Hi ${employee?.name || ''},\n\nYour ${record.leaveType} request (${record.dateFrom} → ${record.dateTo}) was ${decision.toLowerCase()} by ${adminName || 'your manager'} in Cadence.`,
    })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title={`${decision === 'Approved' ? 'Approve' : 'Reject'} Leave Request`} onClose={onClose}>
      <p className="text-sm text-ink-muted">
        {record.leaveType}: {record.dateFrom} → {record.dateTo} ({record.numDays} day
        {record.numDays === 1 ? '' : 's'})
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={handleConfirm} disabled={submitting} className="btn-primary">
          {submitting ? 'Saving…' : `Confirm ${decision}`}
        </button>
      </div>
    </Modal>
  )
}

// --- Admin account actions -------------------------------------------------

// Set-password (Admin SDK, in-portal), reset-password email, and hard-delete.
// Both server-backed actions are inert until FIREBASE_SERVICE_ACCOUNT is set.
function AdminEmployeeActions({ employee, onDeleted }) {
  const [resetState, setResetState] = useState(null) // null | 'sending' | 'sent' | error string
  const [showDelete, setShowDelete] = useState(false)
  const [showSetPassword, setShowSetPassword] = useState(false)

  async function handleReset() {
    setResetState('sending')
    try {
      await sendPasswordResetEmail(auth, employee.email)
      setResetState('sent')
    } catch (err) {
      setResetState(err.message || 'Failed to send reset email.')
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setShowSetPassword(true)} className="btn-secondary text-xs">
          Set password
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetState === 'sending' || resetState === 'sent'}
          className="btn-secondary text-xs"
        >
          {resetState === 'sending' ? 'Sending…' : resetState === 'sent' ? '✓ Reset email sent' : 'Email reset link'}
        </button>
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="rounded-md border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
        >
          Delete employee
        </button>
      </div>
      {resetState && resetState !== 'sending' && resetState !== 'sent' && (
        <p className="text-xs text-rose-400">{resetState}</p>
      )}
      {showSetPassword && (
        <SetPasswordModal employee={employee} onClose={() => setShowSetPassword(false)} />
      )}
      {showDelete && (
        <DeleteEmployeeModal employee={employee} onClose={() => setShowDelete(false)} onDeleted={onDeleted} />
      )}
    </div>
  )
}

function SetPasswordModal({ employee, onClose }) {
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setSubmitting(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid: employee.id, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      setDone(true)
    } catch (err) {
      setError(err.message || 'Could not set password.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Set password — ${employee.name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            ✓ New password set for {employee.name}. Share it with them securely; they can change it later from the
            Password button in the header.
          </p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="btn-primary">
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-ink-muted">
            Sets a new sign-in password directly (stored securely by Firebase Authentication, never in the database).
          </p>
          <label className="block text-sm">
            <span className="font-medium text-ink">New password</span>
            <input
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input mt-1"
              autoComplete="new-password"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" className="h-4 w-4 accent-mint" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show password
          </label>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saving…' : 'Set password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function DeleteEmployeeModal({ employee, onClose, onDeleted }) {
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const canDelete = confirmText.trim() === employee.name

  async function handleDelete() {
    if (!canDelete) return
    setSubmitting(true)
    setError('')
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/delete-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ uid: employee.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
      onDeleted()
    } catch (err) {
      setError(err.message || 'Delete failed.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Delete Employee" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          This <strong>permanently deletes</strong> {employee.name}&apos;s login and every record —
          performance, grievances, recognitions, feedback, leave and 1:1s. This cannot be undone.
        </p>
        <label className="block text-sm">
          <span className="font-medium text-ink">
            Type <span className="font-mono text-rose-300">{employee.name}</span> to confirm
          </span>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="input mt-1"
            autoComplete="off"
          />
        </label>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete || submitting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

