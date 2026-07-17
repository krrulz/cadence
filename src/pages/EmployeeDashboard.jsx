import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import Modal from '../components/Modal.jsx'
import Section from '../components/Section.jsx'
import DataTable from '../components/DataTable.jsx'
import PerformanceTimeline from '../components/PerformanceTimeline.jsx'
import OneOnOnes from '../components/OneOnOnes.jsx'
import Goals from '../components/Goals.jsx'
import { LabeledInput, LabeledTextarea, FormActions } from '../components/FormFields.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getRecordsForEmployee, getRecordsByField, getAllUsers, addRecord } from '../lib/firestoreHelpers.js'
import { computeLeaveBalance, sortByDateDesc } from '../lib/aggregate.js'
import { GRIEVANCE_CATEGORIES, LEAVE_TYPES, PEER_RECOGNITION_TYPES } from '../lib/constants.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetweenInclusive(from, to) {
  if (!from || !to) return 0
  const a = new Date(from)
  const b = new Date(to)
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1
  return diff > 0 ? diff : 0
}

export default function EmployeeDashboard() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState({
    performance: [],
    grievances: [],
    recognitions: [],
    recognitionsGiven: [],
    feedback: [],
    leaves: [],
  })
  const [modal, setModal] = useState(null) // 'grievance' | 'leave' | 'achievement' | 'recognition'

  const loadData = useCallback(async () => {
    setLoading(true)
    const [performance, grievances, recognitions, recognitionsGiven, feedback, leaves] = await Promise.all([
      getRecordsForEmployee('performance', user.uid),
      getRecordsForEmployee('grievances', user.uid),
      getRecordsForEmployee('recognitions', user.uid),
      getRecordsByField('recognitions', 'givenByUid', user.uid),
      getRecordsForEmployee('feedback', user.uid),
      getRecordsForEmployee('leaves', user.uid),
    ])
    setRecords({ performance, grievances, recognitions, recognitionsGiven, feedback, leaves })
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
      <h1 className="text-xl font-semibold text-slate-900">My Dashboard</h1>
      <p className="text-sm text-slate-500">
        {profile.department} · Joined {profile.dateOfJoining} · Manager {profile.managerName || '—'}
      </p>

      <div className="mt-6 space-y-6">
        <Section
          title="My Performance & Achievements"
          onAdd={() => setModal('achievement')}
          addLabel="+ Add Achievement"
        >
          <PerformanceTimeline
            records={records.performance}
            emptyText="No performance reviews or achievements logged yet."
          />
        </Section>

        <Goals employeeId={user.uid} viewer={{ uid: user.uid, name: profile.name, role: 'employee' }} />

        <Section title="My Recognitions" onAdd={() => setModal('recognition')} addLabel="+ Give Recognition">
          <RecognitionsPanel received={records.recognitions} given={records.recognitionsGiven} />
        </Section>

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

        <OneOnOnes
          employeeId={user.uid}
          viewer={{ uid: user.uid, name: profile.name, role: 'employee' }}
          canSchedule={false}
        />

        <Section title="My Grievances" onAdd={() => setModal('grievance')} addLabel="+ Raise Grievance">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Date Raised</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortByDateDesc(records.grievances, 'dateRaised').map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{r.dateRaised}</td>
                    <td className="py-2 pr-4">{r.category}</td>
                    <td className="max-w-xs truncate py-2 pr-4" title={r.description}>
                      {r.description}
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge label={r.status} />
                    </td>
                  </tr>
                ))}
                {records.grievances.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      No grievances raised.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Leave Balance">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {leaveBalance &&
              Object.entries(leaveBalance.byType).map(([type, v]) => (
                <div key={type} className="card">
                  <p className="text-xs font-medium text-slate-500">{type}</p>
                  <p className="mt-1 text-lg font-semibold text-brand">{v.balance}</p>
                  <p className="text-xs text-slate-400">
                    {v.taken} taken / {v.entitlement} entitled
                  </p>
                </div>
              ))}
          </div>
        </Section>

        <Section title="My Leave Requests" onAdd={() => setModal('leave')} addLabel="+ Request Leave">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{r.leaveType}</td>
                    <td className="py-2 pr-4">{r.dateFrom}</td>
                    <td className="py-2 pr-4">{r.dateTo}</td>
                    <td className="py-2 pr-4">{r.numDays}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge label={r.status} />
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{r.approvedBy || '—'}</td>
                  </tr>
                ))}
                {records.leaves.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      No leave requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {modal === 'grievance' && (
        <GrievanceForm employeeId={user.uid} onClose={() => setModal(null)} onSaved={loadData} />
      )}
      {modal === 'leave' && <LeaveForm employeeId={user.uid} onClose={() => setModal(null)} onSaved={loadData} />}
      {modal === 'achievement' && (
        <AchievementForm employeeId={user.uid} onClose={() => setModal(null)} onSaved={loadData} />
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

function RecognitionsPanel({ received, given }) {
  const [view, setView] = useState('received')
  const records = view === 'received' ? received : given

  return (
    <div>
      <div className="mb-3 flex gap-1 border-b border-slate-200">
        {[
          { key: 'received', label: 'Received' },
          { key: 'given', label: 'Given by you' },
        ].map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`px-3 py-1.5 text-sm font-medium ${
              view === v.key ? 'border-b-2 border-brand text-brand' : 'text-slate-500 hover:text-slate-700'
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
          <span className="font-medium text-slate-700">Teammate</span>
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
          <span className="font-medium text-slate-700">Type</span>
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

function AchievementForm({ employeeId, onClose, onSaved }) {
  const [date, setDate] = useState(todayISO())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await addRecord('performance', {
      employeeId,
      entryType: 'Achievement',
      date,
      title,
      description,
    })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Add Achievement" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LabeledInput label="Date" type="date" required value={date} onChange={setDate} />
        <LabeledInput label="Title" required value={title} onChange={setTitle} placeholder="e.g. Shipped the Q3 migration" />
        <LabeledTextarea label="Description" value={description} onChange={setDescription} />
        <FormActions submitting={submitting} onCancel={onClose} submitLabel="Submit" />
      </form>
    </Modal>
  )
}

function GrievanceForm({ employeeId, onClose, onSaved }) {
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
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Raise a Grievance" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Category</span>
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

function LeaveForm({ employeeId, onClose, onSaved }) {
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const numDays = daysBetweenInclusive(dateFrom, dateTo)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await addRecord('leaves', {
      employeeId,
      leaveType,
      dateFrom,
      dateTo,
      numDays,
      status: 'Pending',
    })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Request Leave" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Leave Type</span>
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
        <p className="text-sm text-slate-500">
          Total days: <span className="font-medium text-slate-700">{numDays}</span>
        </p>
        <FormActions submitting={submitting || numDays === 0} onCancel={onClose} submitLabel="Submit" />
      </form>
    </Modal>
  )
}
