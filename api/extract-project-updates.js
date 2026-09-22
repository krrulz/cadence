import { verifyFirebaseToken } from './_verifyFirebaseToken.js'

// Admin-only endpoint backing the Deck Data Prep tab: takes the raw text
// pulled client-side from an uploaded monthly resource-update PPTX (see
// src/lib/pptxText.js) and asks Workers AI to split it into per-resource
// milestone entries — {name, squad, items:[{label, description}]} — for the
// admin to review, correct, and save as real projectUpdates records. Mirrors
// api/compose-email.js's Workers AI pattern.
//
// NOTE: this prompt was written against the *output* SteerCo deck's format
// (Squad Owner name + "(Squad)" heading, bullets often shaped "Topic: detail")
// since a real sample of the *input* per-resource update deck wasn't
// available yet — expect to tune this once tested against a real one.

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct'

const SYSTEM_PROMPT = `You extract structured status-update data from the text of a monthly team PowerPoint deck. The deck contains one or more team members ("resources"), each usually introduced by their name — sometimes followed by their squad/team in parentheses, e.g. "Vaibhav Sharma (AML)" — followed by a list of update bullets for that person.

For each resource found, extract:
- "name": the person's name as written, WITHOUT any trailing squad/team in parentheses.
- "squad": the team/domain name from the parentheses next to their name, or nearby context, or "" if none is shown.
- "items": an array of one {"label", "description"} pair per distinct update bullet:
  - If a bullet has a natural "Topic: detail" shape (a short phrase before a colon), "label" is the part before the colon and "description" is the rest.
  - If a bullet has no natural colon split, write a short label (2-5 words) yourself that summarizes it, and put the full bullet text in "description".
  - Keep wording close to the original — light cleanup only (drop bullet symbols, fix an obviously cut-off word). Never invent facts that aren't in the text.

Ignore slide titles, page numbers, footers, and any text that isn't part of a specific resource's update.

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{"resources": [{"name": "...", "squad": "...", "items": [{"label": "...", "description": "..."}]}]}`

function buildUserPrompt(slidesText) {
  return slidesText.map((text, i) => `--- Slide ${i + 1} ---\n${text}`).join('\n\n')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const accountId = process.env.CF_ACCOUNT_ID
  const apiToken = process.env.CF_API_TOKEN
  const projectId = process.env.FIREBASE_PROJECT_ID
  const model = process.env.CF_AI_MODEL || DEFAULT_MODEL

  if (!accountId || !apiToken || !projectId) {
    return res.status(500).json({
      error: 'Server not configured. Set CF_ACCOUNT_ID, CF_API_TOKEN and FIREBASE_PROJECT_ID.',
    })
  }

  let callerUid
  try {
    const authHeader = req.headers.authorization || ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    const payload = await verifyFirebaseToken(idToken, projectId)
    callerUid = payload.sub
  } catch (err) {
    return res.status(401).json({ error: `Unauthorized: ${err.message}` })
  }

  // Authorize: admin only, checked server-side against Firestore (never
  // trusted from the client) — matches delete-employee.js / set-password.js.
  try {
    const admin = (await import('firebase-admin')).default
    if (!admin.apps.length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT
      if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set')
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
    }
    const callerDoc = await admin.firestore().collection('users').doc(callerUid).get()
    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Only an admin may extract deck data.' })
    }
  } catch (err) {
    return res.status(500).json({ error: `Could not verify admin role: ${err.message}` })
  }

  const { slidesText } = req.body || {}
  if (!Array.isArray(slidesText) || slidesText.length === 0) {
    return res.status(400).json({ error: 'slidesText (a non-empty array of slide text) is required.' })
  }

  try {
    const cfRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(slidesText) },
        ],
        max_tokens: 3000,
      }),
    })

    const payload = await cfRes.json()
    if (!cfRes.ok || payload.success === false) {
      const detail = payload.errors?.map((e) => e.message).join('; ') || `HTTP ${cfRes.status}`
      return res.status(502).json({ error: `Workers AI request failed: ${detail}` })
    }

    const resources = extractResources(payload.result)
    if (!resources) return res.status(502).json({ error: 'Workers AI returned an unreadable response. Try again.' })
    return res.status(200).json({ resources })
  } catch (err) {
    return res.status(502).json({ error: `Workers AI request failed: ${err.message}` })
  }
}

// Workers AI's response shape varies (plain string vs. already-parsed object
// vs. OpenAI-style choices array) and smaller models often wrap JSON in
// prose despite instructions — same defensive parsing as compose-email.js's
// extractEmail, but validating/cleaning the resources array shape.
export function extractResources(result) {
  const raw = result?.response ?? result?.choices?.[0]?.message?.content
  let parsed = null

  if (raw && typeof raw === 'object') {
    parsed = raw
  } else if (typeof raw === 'string' && raw.trim()) {
    const match = /\{[\s\S]*\}/.exec(raw)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch {
        return null
      }
    }
  }

  if (!parsed || !Array.isArray(parsed.resources)) return null

  return parsed.resources
    .map((r) => ({
      name: String(r?.name || '').trim(),
      squad: String(r?.squad || '').trim(),
      items: Array.isArray(r?.items)
        ? r.items
            .map((it) => ({ label: String(it?.label || '').trim(), description: String(it?.description || '').trim() }))
            .filter((it) => it.label || it.description)
        : [],
    }))
    .filter((r) => r.name && r.items.length > 0)
}
