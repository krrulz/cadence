import admin from 'firebase-admin'
import { verifyFirebaseToken } from './_verifyFirebaseToken.js'

// Admin sets a new password for an employee. The password is written to
// Firebase Authentication (stored hashed by Google) — it is never persisted in
// Firestore. Requires the same FIREBASE_SERVICE_ACCOUNT as delete-employee;
// inert (clean 500) until that is configured.

function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
  }
  return admin
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId || !process.env.FIREBASE_SERVICE_ACCOUNT) {
    return res.status(500).json({
      error: 'Server not configured. Set FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT.',
    })
  }

  // Authenticate the caller.
  let callerUid
  try {
    const authHeader = req.headers.authorization || ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    const payload = await verifyFirebaseToken(idToken, projectId)
    callerUid = payload.sub
  } catch (err) {
    return res.status(401).json({ error: `Unauthorized: ${err.message}` })
  }

  const { uid, password } = req.body || {}
  if (!uid || !password) return res.status(400).json({ error: 'uid and password are required.' })
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' })

  try {
    const app = getAdmin()
    // Authorize: caller must be an admin (checked server-side against Firestore).
    const callerDoc = await app.firestore().collection('users').doc(callerUid).get()
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Only an admin may set passwords.' })
    }

    await app.auth().updateUser(uid, { password: String(password) })
    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: `Could not set password: ${err.message}` })
  }
}
