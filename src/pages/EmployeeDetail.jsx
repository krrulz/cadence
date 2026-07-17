import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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
import { LabeledInput, LabeledTextarea, FormActions } from '../components/FormFields.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getUserDoc, getRecordsForEmployee, addRecord, updateRecord } from '../lib/firestoreHelpers.js'
import { computeLeaveBalance, sortByDateDesc } from '../lib/aggregate.js'
import { GRIEVANCE_STATUSES, FEEDBACK_TYPES, RECOGNITION_TYPES } from '../lib/constants.js'
import {
  performanceSummaryLine,
  grievanceSummaryLine,
  recognitionSummaryLine,
  feedbackSummaryLine,
  leaveSummaryLine,
} from '../lib/summaryLines.js'

const TABS = ['Performance', 'Grievances', 'Recognitions', 'Feedback', 'Leave', '1:1s']
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
        <p className="text-slate-500">Employee not found.</p>
        <Link to="/" className="text-brand underline">
          Back to dashboard
        </Link>
      </Layout>
    )
  }

  return (
    <Layout>
      <button type="button" onClick={() => navigate('/')} className="text-sm text-brand hover:underline">
        ← Back to roster
      </button>

      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{employee.name}</h1>
          <p className="text-sm text-slate-500">
            {employee.department} · Joined {employee.dateOfJoining} · Manager {employee.managerName || '—'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 px-4 py-2 text-sm font-medium ${
              tab === t
                ? 'border-b-2 border-brand text-brand'
                : 'text-slate-500 hover:text-slate-700'
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
            selectedIds={selectedIdsByCollection.performance}
            onToggle={makeToggle('performance', performanceSummaryLine)}
          />
        )}
        {tab === 'Grievances' && (
          <GrievancesTab
            records={records.grievances}
            onUpdate={(rec) => setModal({ type: 'update-grievance', data: rec })}
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
        {tab === '1:1s' && (
          <OneOnOnes
            employeeId={uid}
            viewer={{ uid: adminProfile?.id, name: adminProfile?.name, role: 'admin' }}
            canSchedule
          />
        )}
      </div>

      {selectedItems.length > 0 && (
        <div className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <span className="text-sm font-medium text-slate-700">
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
          defaultGivenBy={adminProfile?.name}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal?.type === 'update-grievance' && (
        <GrievanceUpdateForm
          record={modal.data}
          defaultResolvedBy={adminProfile?.name}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
      {modal?.type === 'decide-leave' && (
        <LeaveDecisionModal
          record={modal.data}
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

// --- Performance -------------------------------------------------------

// Small checkbox cell used by the selectable tables below.
function SelectCell({ record, selectedIds, onToggle }) {
  return (
    <td className="py-2 pr-2">
      <input
        type="checkbox"
        className="h-4 w-4 accent-brand"
        checked={!!selectedIds?.has(record.id)}
        onChange={() => onToggle?.(record)}
        aria-label="Select row"
      />
    </td>
  )
}

function PerformanceTab({ records, onAdd, selectedIds, onToggle }) {
  return (
    <Section title="Performance & Achievements" onAdd={onAdd} addLabel="+ Add Review">
      <PerformanceTimeline
        records={records}
        emptyText="No performance reviews or achievements logged yet."
        selectable
        selectedIds={selectedIds}
        onToggle={onToggle}
      />
    </Section>
  )
}

function PerformanceForm({ employeeId, defaultReviewer, onClose, onSaved }) {
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
            <span className="font-medium text-slate-700">Rating (1-5)</span>
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

// --- Grievances ----------------------------------------------------------

function GrievancesTab({ records, onUpdate, selectedIds, onToggle }) {
  const sorted = sortByDateDesc(records, 'dateRaised')
  return (
    <Section title="Grievances">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-2"></th>
              <th className="py-2 pr-4">Date Raised</th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Resolved</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <SelectCell record={r} selectedIds={selectedIds} onToggle={onToggle} />
                <td className="py-2 pr-4">{r.dateRaised}</td>
                <td className="py-2 pr-4">{r.category}</td>
                <td className="py-2 pr-4 max-w-xs truncate" title={r.description}>{r.description}</td>
                <td className="py-2 pr-4">
                  <StatusBadge label={r.status} />
                </td>
                <td className="py-2 pr-4 text-slate-500">
                  {r.status === 'Resolved' ? `${r.resolutionDate || ''} by ${r.resolvedBy || ''}` : '—'}
                </td>
                <td className="py-2 pr-4">
                  <button type="button" onClick={() => onUpdate(r)} className="text-brand hover:underline">
                    Update
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  No grievances raised.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function GrievanceUpdateForm({ record, defaultResolvedBy, onClose, onSaved }) {
  const [status, setStatus] = useState(record.status)
  const [resolutionDate, setResolutionDate] = useState(record.resolutionDate || '')
  const [resolvedBy, setResolvedBy] = useState(record.resolvedBy || defaultResolvedBy || '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const data = { status }
    if (status === 'Resolved') {
      data.resolutionDate = resolutionDate
      data.resolvedBy = resolvedBy
    }
    await updateRecord('grievances', record.id, data)
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Update Grievance" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">{record.description}</p>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input mt-1">
            {GRIEVANCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
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
            <span className="font-medium text-slate-700">Type</span>
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
            <span className="font-medium text-slate-700">Shared publicly</span>
          </label>
        </div>
        <LabeledTextarea label="Description" required value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} />
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// --- Feedback --------------------------------------------------------------

function FeedbackTab({ records, onAdd, selectedIds, onToggle }) {
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
      />
    </Section>
  )
}

function FeedbackForm({ employeeId, defaultGivenBy, onClose, onSaved }) {
  const [form, setForm] = useState({
    date: '',
    type: FEEDBACK_TYPES[0],
    givenBy: defaultGivenBy || '',
    summary: '',
    actionItems: '',
    followUpDate: '',
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await addRecord('feedback', { employeeId, ...form })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Add Feedback" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="Date" type="date" required value={form.date} onChange={(v) => setForm((f) => ({ ...f, date: v }))} />
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Type</span>
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
                <p className="text-xs font-medium text-slate-500">{type}</p>
                <p className="mt-1 text-lg font-semibold text-brand">{v.balance}</p>
                <p className="text-xs text-slate-400">
                  {v.taken} taken / {v.entitlement} entitled
                </p>
                {v.takenBefore > 0 && (
                  <p className="text-xs text-slate-400">
                    ({v.takenBefore} before Cadence, {v.takenInApp} logged here)
                  </p>
                )}
              </div>
            ))}
        </div>
      </Section>

      <Section title="Leave Log">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
                <tr key={r.id} className="border-b border-slate-100">
                  <SelectCell record={r} selectedIds={selectedIds} onToggle={onToggle} />
                  <td className="py-2 pr-4">{r.leaveType}</td>
                  <td className="py-2 pr-4">{r.dateFrom}</td>
                  <td className="py-2 pr-4">{r.dateTo}</td>
                  <td className="py-2 pr-4">{r.numDays}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge label={r.status} />
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{r.approvedBy || '—'}</td>
                  <td className="py-2 pr-4">
                    {r.status === 'Pending' && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => onApprove(r)} className="text-green-700 hover:underline">
                          Approve
                        </button>
                        <button type="button" onClick={() => onReject(r)} className="text-red-700 hover:underline">
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
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

function LeaveDecisionModal({ record, decision, adminName, onClose, onSaved }) {
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setSubmitting(true)
    await updateRecord('leaves', record.id, { status: decision, approvedBy: adminName || '' })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title={`${decision === 'Approved' ? 'Approve' : 'Reject'} Leave Request`} onClose={onClose}>
      <p className="text-sm text-slate-600">
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

