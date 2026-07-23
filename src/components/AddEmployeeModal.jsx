import { useState } from 'react'
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { getSecondaryAuth } from '../firebase.js'
import { createUserProfile } from '../lib/firestoreHelpers.js'
import { LEAVE_TYPES, DEFAULT_LEAVE_ENTITLEMENTS, DEFAULT_LEAVE_OPENING_TAKEN } from '../lib/constants.js'
import { parseCsv, BULK_UPLOAD_TEMPLATE, downloadTextFile } from '../lib/csv.js'
import { normalizeBirthday } from '../lib/birthday.js'
import Modal from './Modal.jsx'
import BirthdayField from './BirthdayField.jsx'

const emptyForm = {
  name: '',
  email: '',
  password: '',
  department: '',
  managerName: '',
  birthday: '', // 'MM-DD', no year
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Shared by both the single form and the bulk loop so the secondary-auth
// dance (create on a throwaway app instance, sign out, never touch the
// admin's own session) only lives in one place.
async function createEmployeeAccount({
  name,
  email,
  password,
  department,
  managerName,
  dateOfJoining,
  birthday,
  leaveEntitlements,
  leaveOpeningTaken,
}) {
  const secondaryAuth = getSecondaryAuth()
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    const uid = cred.user.uid
    await signOut(secondaryAuth)

    await createUserProfile(uid, {
      name,
      email,
      role: 'employee',
      department,
      managerName: managerName || '',
      dateOfJoining: dateOfJoining || '',
      birthday: normalizeBirthday(birthday),
      status: 'Active',
      leaveEntitlements,
      leaveOpeningTaken: leaveOpeningTaken || { ...DEFAULT_LEAVE_OPENING_TAKEN },
    })
    return { ok: true, uid }
  } catch (err) {
    try {
      await signOut(secondaryAuth)
    } catch {
      // ignore
    }
    const message = err.code === 'auth/email-already-in-use' ? 'Email already registered' : err.message
    return { ok: false, error: message }
  }
}

export default function AddEmployeeModal({ onClose, onCreated }) {
  const [mode, setMode] = useState('single')

  return (
    <Modal title="Add Employee" onClose={onClose} wide>
      <div className="mb-4 inline-flex rounded-full border border-surface-border p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode('single')}
          className={`rounded-full px-3 py-1 font-medium ${mode === 'single' ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'}`}
        >
          Single
        </button>
        <button
          type="button"
          onClick={() => setMode('bulk')}
          className={`rounded-full px-3 py-1 font-medium ${mode === 'bulk' ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'}`}
        >
          Bulk (CSV)
        </button>
      </div>

      {mode === 'single' ? (
        <SingleAddForm onClose={onClose} onCreated={onCreated} />
      ) : (
        <BulkUploadPanel onClose={onClose} onCreated={onCreated} />
      )}
    </Modal>
  )
}

function SingleAddForm({ onClose, onCreated }) {
  const [form, setForm] = useState(emptyForm)
  const [entitlements, setEntitlements] = useState(DEFAULT_LEAVE_ENTITLEMENTS)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function updateEntitlement(type, value) {
    setEntitlements((e) => ({ ...e, [type]: Number(value) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const result = await createEmployeeAccount({ ...form, leaveEntitlements: entitlements })
    setSubmitting(false)

    if (result.ok) {
      onCreated?.()
      onClose()
    } else {
      setError(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full Name" required>
          <input required value={form.name} onChange={(e) => update('name', e.target.value)} className="input" />
        </Field>
        <Field label="Email" required>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Temporary Password" required>
          <input
            type="text"
            required
            minLength={6}
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Department" required>
          <input
            required
            value={form.department}
            onChange={(e) => update('department', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Manager Name">
          <input value={form.managerName} onChange={(e) => update('managerName', e.target.value)} className="input" />
        </Field>
        <BirthdayField value={form.birthday} onChange={(v) => update('birthday', v)} />
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Leave Entitlements (days/year)</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {LEAVE_TYPES.map((type) => (
            <Field key={type} label={type}>
              <input
                type="number"
                min={0}
                value={entitlements[type]}
                onChange={(e) => updateEntitlement(type, e.target.value)}
                className="input"
              />
            </Field>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Creating…' : 'Create Employee'}
        </button>
      </div>
    </form>
  )
}

function validateBulkRow(row) {
  if (!row.name) return 'Missing name'
  if (!row.email || !EMAIL_RE.test(row.email)) return 'Missing/invalid email'
  if (!row.password || row.password.length < 6) return 'Password must be 6+ characters'
  if (!row.department) return 'Missing department'
  if (!row.dateofjoining) return 'Missing dateOfJoining'
  return null
}

function BulkUploadPanel({ onClose, onCreated }) {
  const [rows, setRows] = useState([]) // { name, email, password, department, managername, dateofjoining, error, status }
  const [fileName, setFileName] = useState('')
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setDone(false)
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result))
      setRows(
        parsed.map((row) => ({
          ...row,
          error: validateBulkRow(row),
          status: 'pending',
        })),
      )
    }
    reader.readAsText(file)
  }

  const validRows = rows.filter((r) => !r.error)

  async function handleUpload() {
    setProcessing(true)
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].error) continue
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: 'creating' } : r)))
      const row = rows[i]
      const result = await createEmployeeAccount({
        name: row.name,
        email: row.email,
        password: row.password,
        department: row.department,
        managerName: row.managername,
        dateOfJoining: row.dateofjoining,
        leaveEntitlements: DEFAULT_LEAVE_ENTITLEMENTS,
      })
      setRows((prev) =>
        prev.map((r, idx) =>
          idx === i ? { ...r, status: result.ok ? 'created' : 'failed', error: result.ok ? null : result.error } : r,
        ),
      )
    }
    setProcessing(false)
    setDone(true)
    onCreated?.()
  }

  const createdCount = rows.filter((r) => r.status === 'created').length
  const failedCount = rows.filter((r) => r.status === 'failed').length

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-white/5 p-3 text-sm text-ink-muted">
        <p className="mb-2">
          Upload a CSV with columns <code className="rounded bg-white/10 px-1 py-0.5">name, email, password, department,
          managerName, dateOfJoining</code>. Every row creates an <strong>employee</strong> account with the standard leave
          entitlements (12/10/15/5) — there's no per-row entitlement editing yet.
        </p>
        <button
          type="button"
          onClick={() => downloadTextFile('employee-bulk-upload-template.csv', BULK_UPLOAD_TEMPLATE)}
          className="text-mint hover:underline"
        >
          Download CSV template
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink">CSV file</label>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} className="input mt-1" disabled={processing} />
        {fileName && <p className="mt-1 text-xs text-ink-muted">{fileName}</p>}
      </div>

      {rows.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-md border border-surface-border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white/5">
              <tr className="text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="px-3 py-1.5">{r.name || '—'}</td>
                  <td className="px-3 py-1.5">{r.email || '—'}</td>
                  <td className="px-3 py-1.5">{r.department || '—'}</td>
                  <td className="px-3 py-1.5">
                    <RowStatus row={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <p className="text-sm text-ink-muted">
          {validRows.length} of {rows.length} rows ready to upload.
          {done && ` ${createdCount} created, ${failedCount} failed.`}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">
          {done ? 'Close' : 'Cancel'}
        </button>
        {!done && (
          <button
            type="button"
            onClick={handleUpload}
            disabled={processing || validRows.length === 0}
            className="btn-primary"
          >
            {processing ? 'Creating…' : `Create ${validRows.length} Employee${validRows.length === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </div>
  )
}

function RowStatus({ row }) {
  if (row.status === 'created') return <span className="text-mint">Created</span>
  if (row.status === 'creating') return <span className="text-ink-muted">Creating…</span>
  if (row.status === 'failed') return <span className="text-rose-400">Failed: {row.error}</span>
  if (row.error) return <span className="text-rose-400">{row.error}</span>
  return <span className="text-ink-faint">Ready</span>
}

function Field({ label, required, children }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
