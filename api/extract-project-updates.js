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
        max_tokens: 4096,
      }),
    })

    const payload = await cfRes.json()
    if (!cfRes.ok || payload.success === false) {
      const detail = payload.errors?.map((e) => e.message).join('; ') || `HTTP ${cfRes.status}`
      console.error('[extract-project-updates] Workers AI call failed:', detail)
      return res.status(502).json({ error: `Workers AI request failed: ${detail}` })
    }

    // Always log the raw response server-side (visible in Vercel's runtime
    // logs) — the single most useful thing for diagnosing a bad extraction,
    // whether it parses or not.
    const rawText = typeof payload.result?.response === 'string' ? payload.result.response : JSON.stringify(payload.result)
    console.log('[extract-project-updates] raw Workers AI response:', rawText?.slice(0, 4000))

    const resources = extractResources(payload.result)
    if (!resources) {
      return res.status(502).json({
        error: 'Workers AI returned a response that could not be parsed into resources. Try again, or try a shorter upload.',
        rawPreview: (rawText || '').slice(0, 500),
      })
    }
    return res.status(200).json({ resources })
  } catch (err) {
    console.error('[extract-project-updates] unexpected error:', err)
    return res.status(502).json({ error: `Workers AI request failed: ${err.message}` })
  }
}

// Scan `text` starting at `startIdx` (which must be an opening brace or
// bracket) and return the index just past its matching close, respecting
// string literals/escapes — or -1 if the text ends before it closes (a
// truncated response, the most common real failure with smaller models
// asked for a long, multi-resource JSON payload).
function findMatchingClose(text, startIdx) {
  const open = text[startIdx]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

// Best-effort repair for a JSON object truncated mid-way (hit max_tokens):
// trim back to the last fully-closed array/object element, then append
// whatever closing brackets are needed to balance it. Recovers the
// resources found before the cutoff instead of discarding the whole
// response over its unfinished tail.
function repairTruncatedJson(fragment) {
  let inString = false
  let escaped = false
  let lastSafeEnd = -1
  let closersAtLastSafeEnd = null
  const stack = []
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') stack.push(ch)
    else if (ch === '}' || ch === ']') {
      stack.pop()
      // fragment starts at the outer `{`, so stack === ['{', '['] (length 2)
      // right after we've just closed one complete element of the
      // top-level "resources" array — the safest possible truncation point.
      // Snapshot the stack *at this point* (not the final one) since that's
      // what needs closing once we slice back to here.
      if (stack.length === 2) {
        lastSafeEnd = i + 1
        closersAtLastSafeEnd = stack.slice()
      }
    }
  }
  if (lastSafeEnd === -1 || !closersAtLastSafeEnd) return null
  const closers = closersAtLastSafeEnd
    .slice()
    .reverse()
    .map((c) => (c === '{' ? '}' : ']'))
    .join('')
  try {
    return JSON.parse(fragment.slice(0, lastSafeEnd) + closers)
  } catch {
    return null
  }
}

// Workers AI's response shape varies (plain string vs. already-parsed object
// vs. OpenAI-style choices array), smaller models often wrap JSON in prose
// despite instructions, and a long multi-resource extraction can get cut off
// by max_tokens before the JSON closes — this handles all three rather than
// a single greedy regex, which breaks on any of them.
export function extractResources(result) {
  const raw = result?.response ?? result?.choices?.[0]?.message?.content
  let parsed = null

  if (raw && typeof raw === 'object') {
    parsed = raw
  } else if (typeof raw === 'string' && raw.trim()) {
    const start = raw.indexOf('{')
    if (start !== -1) {
      const end = findMatchingClose(raw, start)
      if (end !== -1) {
        try {
          parsed = JSON.parse(raw.slice(start, end))
        } catch {
          parsed = repairTruncatedJson(raw.slice(start))
        }
      } else {
        // No matching close before the text ran out — truncated response.
        parsed = repairTruncatedJson(raw.slice(start))
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
