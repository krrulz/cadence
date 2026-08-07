import admin from 'firebase-admin'

// Public, unauthenticated endpoint backing the self-service Skill Survey
// (src/pages/SkillSurvey.jsx) — for employees who don't have a Cadence login
// yet. There is deliberately NO Firestore rule that lets anonymous clients
// write to `skills`; every write here goes through the Admin SDK (which
// bypasses security rules entirely), gated by a shared passcode checked
// server-side. This keeps the real client-side `skills` rules exactly as
// strict as they are for the logged-in app.
//
// GET  ?passcode=XXX        -> { employees: [{ id, name }] }   (name only —
//                               no email/department is exposed publicly)
// POST { passcode, employeeId, entries }
//                            -> upserts each entry into `skills`, keyed by
//                               (employeeId, name) so a resubmission updates
//                               the level instead of duplicating rows.
//
// The whole handler runs inside one try/catch so nothing ever escapes as a
// bare framework 500 — every failure returns JSON with a message, and the
// real error is also console.error'd so it shows up in Vercel's runtime logs.

// Keep in sync with SKILL_CATEGORIES in src/lib/constants.js. Duplicated here
// (rather than imported) to keep this serverless function self-contained.
const ALLOWED_CATEGORIES = ['Professional Skills', 'Tools/Technologies', 'Domain Knowledge', 'Soft Skill']
const MAX_ENTRIES = 150
const MAX_NAME_LEN = 80

function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
  }
  return admin
}

function passcodeOk(supplied) {
  const expected = process.env.SKILL_SURVEY_PASSCODE
  return !!expected && typeof supplied === 'string' && supplied === expected
}

// req.query is populated by Vercel's Node runtime, but parse the raw URL as a
// fallback so a GET never depends on that alone.
function getQueryParam(req, name) {
  if (req.query && typeof req.query[name] === 'string') return req.query[name]
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    return url.searchParams.get(name) || undefined
  } catch {
    return undefined
  }
}

export default async function handler(req, res) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.SKILL_SURVEY_PASSCODE) {
      return res.status(500).json({
        error: 'Server not configured. Set FIREBASE_SERVICE_ACCOUNT and SKILL_SURVEY_PASSCODE.',
      })
    }

    const db = getAdmin().firestore()

    if (req.method === 'GET') {
      const passcode = getQueryParam(req, 'passcode')
      if (!passcodeOk(passcode)) return res.status(401).json({ error: 'Incorrect passcode.' })
      const snap = await db.collection('users').where('role', '==', 'employee').get()
      const employees = snap.docs
        .map((d) => ({ id: d.id, name: d.data().name || 'Unnamed' }))
        .sort((a, b) => a.name.localeCompare(b.name))
      return res.status(200).json({ employees })
    }

    if (req.method === 'POST') {
      const { passcode, employeeId, entries } = req.body || {}
      if (!passcodeOk(passcode)) return res.status(401).json({ error: 'Incorrect passcode.' })
      if (!employeeId || typeof employeeId !== 'string') return res.status(400).json({ error: 'Missing employeeId.' })
      if (!Array.isArray(entries) || entries.length === 0) return res.status(400).json({ error: 'No skills submitted.' })
      if (entries.length > MAX_ENTRIES) return res.status(400).json({ error: 'Too many skills in one submission.' })

      const empDoc = await db.collection('users').doc(employeeId).get()
      if (!empDoc.exists || empDoc.data().role !== 'employee') {
        return res.status(400).json({ error: 'Unknown employee.' })
      }

      const clean = []
      for (const e of entries) {
        const name = String(e?.name || '').trim().slice(0, MAX_NAME_LEN)
        const category = ALLOWED_CATEGORIES.includes(e?.category) ? e.category : null
        const level = Number(e?.level)
        if (!name || !category || !Number.isInteger(level) || level < 1 || level > 5) continue
        clean.push({ name, category, level })
      }
      if (clean.length === 0) return res.status(400).json({ error: 'No valid skills submitted.' })

      const existingSnap = await db.collection('skills').where('employeeId', '==', employeeId).get()
      const existingByName = new Map(existingSnap.docs.map((d) => [d.data().name, d.ref]))

      const batch = db.batch()
      const now = new Date().toISOString()
      for (const s of clean) {
        const existingRef = existingByName.get(s.name)
        const ref = existingRef || db.collection('skills').doc()
        const data = {
          employeeId,
          name: s.name,
          category: s.category,
          level: s.level,
          updatedByRole: 'self-survey',
          updatedAt: now,
        }
        if (!existingRef) data.createdAt = now
        batch.set(ref, data, { merge: true })
      }
      await batch.commit()

      return res.status(200).json({ ok: true, imported: clean.length })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[skill-survey]', err)
    return res.status(500).json({ error: err.message || 'Unexpected server error.' })
  }
}
