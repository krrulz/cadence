import { useState } from 'react'
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'
import Modal from './Modal.jsx'
import { auth } from '../firebase.js'

// Lets the signed-in user set a new password themselves. The password is sent
// straight to Firebase Authentication (which stores it hashed) — it is never
// written to Firestore. Firebase requires a recent login to change a password,
// so we re-authenticate with the current password first.
export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (next.length < 6) return setError('New password must be at least 6 characters.')
    if (next !== confirm) return setError('New passwords do not match.')

    setSubmitting(true)
    try {
      const user = auth.currentUser
      // Re-authenticate to satisfy Firebase's recent-login requirement.
      const cred = EmailAuthProvider.credential(user.email, current)
      await reauthenticateWithCredential(user, cred)
      await updatePassword(user, next)
      setDone(true)
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Your current password is incorrect.')
      } else if (err.code === 'auth/weak-password') {
        setError('That password is too weak — use at least 6 characters.')
      } else {
        setError(err.message || 'Could not change password.')
      }
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Change password" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">✓ Your password has been updated.</p>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="btn-primary">
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Current password" value={current} onChange={setCurrent} show={show} autoComplete="current-password" />
          <Field label="New password" value={next} onChange={setNext} show={show} autoComplete="new-password" />
          <Field label="Confirm new password" value={confirm} onChange={setConfirm} show={show} autoComplete="new-password" />

          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" className="h-4 w-4 accent-mint" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show passwords
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

function Field({ label, value, onChange, show, autoComplete }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink">{label}</span>
      <input
        type={show ? 'text' : 'password'}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-1"
      />
    </label>
  )
}
