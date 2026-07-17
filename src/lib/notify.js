import { auth } from '../firebase.js'
import { getAllUsers } from './firestoreHelpers.js'

// Fire-and-forget email alerts. These are best-effort: any failure (including
// SMTP simply not being configured) is swallowed so it never blocks or breaks
// the action that triggered it. The server rejects unauthenticated calls and
// no-ops when SMTP_* env vars are absent.

export async function sendAlert({ to, subject, text }) {
  try {
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
    if (recipients.length === 0) return
    const user = auth.currentUser
    if (!user) return
    const idToken = await user.getIdToken()
    await fetch('/api/send-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ to: recipients, subject, text }),
    })
  } catch {
    // Intentionally ignored — alerts must never surface an error to the user.
  }
}

// Email addresses of all admins — used to notify managers of employee actions.
export async function getAdminEmails() {
  try {
    const users = await getAllUsers()
    return users.filter((u) => u.role === 'admin' && u.email).map((u) => u.email)
  } catch {
    return []
  }
}
