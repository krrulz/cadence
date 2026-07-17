import admin from 'firebase-admin'
import { verifyFirebaseToken } from './_verifyFirebaseToken.js'

// Collections keyed by employeeId that must be purged when an employee is
// hard-deleted. oneOnOnes is handled separately because it has subcollections.
const EMPLOYEE_COLLECTIONS = ['performance', 'grievances', 'recognitions', 'feedback', 'leaves']

// Lazily initialise the Admin SDK from a service-account JSON stored in an env
// var. Kept out of module top-level so a missing key yields a clean 500 rather
// than a cold-start crash.
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

  // 1. Authenticate the caller.
  let callerUid
  try {
    const authHeader = req.headers.authorization || ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    const payload = await verifyFirebaseToken(idToken, projectId)
    callerUid = payload.sub
  } catch (err) {
    return res.status(401).json({ error: `Unauthorized: ${err.message}` })
  }

  const { uid } = req.body || {}
  if (!uid) return res.status(400).json({ error: 'uid is required.' })
  if (uid === callerUid) return res.status(400).json({ error: 'You cannot delete your own account.' })

  try {
    const app = getAdmin()
    const db = app.firestore()

    // 2. Authorize: the caller must be an admin. Checked server-side against
    //    Firestore, never trusted from the client.
    const callerDoc = await db.collection('users').doc(callerUid).get()
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Only an admin may delete employees.' })
    }

    // 3. Cascade-delete the employee's records.
    let deletedRecords = 0
    for (const col of EMPLOYEE_COLLECTIONS) {
      const snap = await db.collection(col).where('employeeId', '==', uid).get()
      for (const d of snap.docs) {
        await d.ref.delete()
        deletedRecords++
      }
    }
    // oneOnOnes carry note/action subcollections — recursiveDelete clears those too.
    const oneOnOnes = await db.collection('oneOnOnes').where('employeeId', '==', uid).get()
    for (const d of oneOnOnes.docs) {
      await db.recursiveDelete(d.ref)
      deletedRecords++
    }

    // 4. Delete the profile doc, then the auth account.
    await db.collection('users').doc(uid).delete()
    try {
      await app.auth().deleteUser(uid)
    } catch (err) {
      // The profile + records are already gone; report but don't fail hard if
      // the auth user was already missing.
      if (err.code !== 'auth/user-not-found') throw err
    }

    return res.status(200).json({ ok: true, deletedRecords })
  } catch (err) {
    return res.status(500).json({ error: `Delete failed: ${err.message}` })
  }
}
