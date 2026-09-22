import admin from 'firebase-admin'

// Public, unauthenticated endpoint backing the Farewell Wall (src/pages/
// FarewellWall.jsx) — for colleagues who may not have a Cadence login at
// all. There is deliberately NO Firestore rule that lets anonymous clients
// read or write `farewellWishes`/`farewellSettings`; every call here goes
// through the Admin SDK (bypasses security rules), gated by a shared
// passcode checked server-side. This is the same pattern as
// api/skill-survey.js, and it's what keeps one submitter from ever reading
// another's wish: the public page never talks to Firestore directly.
//
// GET  ?passcode=XXX&token=YYY
//   -> { isOpen, honoreeName, backgrounds, wordLimit, mySubmission }
//      `mySubmission` is this token's own prior submission (or null) so a
//      visitor who already submitted can review/edit it — never anyone
//      else's.
// POST { passcode, token, name, message, backgroundId }
//   -> upserts one wish keyed by `token` (a random id the client mints and
//      keeps in localStorage), so resubmitting with the same token edits
//      that same wish instead of creating a second one.
//
// The whole handler runs inside one try/catch so nothing ever escapes as a
// bare framework 500 — every failure returns JSON with a message, and the
// real error is also console.error'd so it shows up in Vercel's runtime logs.

// Kept in sync by hand with the SVGs in src/assets/farewell/ and the
// FAREWELL_BACKGROUNDS list in src/pages/FarewellWall.jsx. Duplicated here
// (rather than imported) to keep this serverless function self-contained,
// matching api/skill-survey.js's convention.
const BACKGROUND_IDS = ['aurora', 'confetti', 'constellation', 'peaks', 'botanical']
const HONOREE_NAME = 'Ragunathan Palanisamy'
const WORD_LIMIT = 20
const MAX_NAME_LEN = 60

function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
  }
  return admin
}

function passcodeOk(supplied) {
  const expected = process.env.FAREWELL_PASSCODE
  return !!expected && typeof supplied === 'string' && supplied === expected
}

function getQueryParam(req, name) {
  if (req.query && typeof req.query[name] === 'string') return req.query[name]
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    return url.searchParams.get(name) || undefined
  } catch {
    return undefined
  }
}

function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length
}

export default async function handler(req, res) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.FAREWELL_PASSCODE) {
      return res.status(500).json({
        error: 'Server not configured. Set FIREBASE_SERVICE_ACCOUNT and FAREWELL_PASSCODE.',
      })
    }

    const db = getAdmin().firestore()

    if (req.method === 'GET') {
      const passcode = getQueryParam(req, 'passcode')
      if (!passcodeOk(passcode)) return res.status(401).json({ error: 'Incorrect passcode.' })

      const settingsDoc = await db.collection('farewellSettings').doc('config').get()
      const isOpen = settingsDoc.exists ? settingsDoc.data().isOpen !== false : true

      let mySubmission = null
      const token = getQueryParam(req, 'token')
      if (token) {
        const mine = await db.collection('farewellWishes').doc(token).get()
        if (mine.exists) {
          const d = mine.data()
          mySubmission = { name: d.name, message: d.message, backgroundId: d.backgroundId }
        }
      }

      return res.status(200).json({
        isOpen,
        honoreeName: HONOREE_NAME,
        backgrounds: BACKGROUND_IDS,
        wordLimit: WORD_LIMIT,
        mySubmission,
      })
    }

    if (req.method === 'POST') {
      const { passcode, token, name, message, backgroundId } = req.body || {}
      if (!passcodeOk(passcode)) return res.status(401).json({ error: 'Incorrect passcode.' })
      if (!token || typeof token !== 'string' || token.length > 100) {
        return res.status(400).json({ error: 'Missing or invalid token.' })
      }

      const settingsDoc = await db.collection('farewellSettings').doc('config').get()
      const isOpen = settingsDoc.exists ? settingsDoc.data().isOpen !== false : true
      if (!isOpen) return res.status(403).json({ error: 'This activity is closed.' })

      const cleanName = String(name || '').trim().slice(0, MAX_NAME_LEN)
      const cleanMessage = String(message || '').trim()
      if (!cleanName) return res.status(400).json({ error: 'Name is required.' })
      if (!cleanMessage) return res.status(400).json({ error: 'Message is required.' })
      if (wordCount(cleanMessage) > WORD_LIMIT) {
        return res.status(400).json({ error: `Message must be ${WORD_LIMIT} words or fewer.` })
      }
      if (!BACKGROUND_IDS.includes(backgroundId)) {
        return res.status(400).json({ error: 'Pick one of the background options.' })
      }

      const existing = await db.collection('farewellWishes').doc(token).get()
      const now = new Date().toISOString()
      await db
        .collection('farewellWishes')
        .doc(token)
        .set({
          name: cleanName,
          message: cleanMessage,
          backgroundId,
          createdAt: existing.exists ? existing.data().createdAt : now,
          updatedAt: now,
        })

      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[farewell]', err)
    return res.status(500).json({ error: err.message || 'Unexpected server error.' })
  }
}
