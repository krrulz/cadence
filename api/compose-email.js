import { verifyFirebaseToken } from './_verifyFirebaseToken.js'

// Model is configurable because Cloudflare's catalogue changes; this default is a
// solid general-purpose instruct model on the Workers AI free tier.
const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct'

const SYSTEM_PROMPT = `You are helping a people manager write a short, warm, human email to or about a team member.

You will be given the employee's name and a list of factual records (performance reviews, achievements, grievances, recognitions, feedback, leave requests) that the manager selected.

Write a brief email that:
- Opens naturally and addresses the person by name.
- Weaves the records into flowing prose. Do NOT just restate them as a bulleted list.
- Sounds like a real manager wrote it: warm, specific, direct. Not corporate filler.
- Acknowledges positives genuinely and raises concerns tactfully.
- Stays under 200 words.
- Does not invent any facts beyond the records given.

Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{"subject": "...", "body": "..."}`

const GROUP_LABELS = {
  performance: 'Performance & Achievements',
  grievances: 'Grievances',
  recognitions: 'Recognitions',
  feedback: 'Feedback',
  leaves: 'Leave',
}

function buildUserPrompt(employeeName, items) {
  const byGroup = {}
  for (const item of items) {
    ;(byGroup[item.collection] ||= []).push(item.summary)
  }
  const sections = Object.entries(byGroup)
    .map(([g, lines]) => `${GROUP_LABELS[g] || g}:\n${lines.map((l) => `- ${l}`).join('\n')}`)
    .join('\n\n')

  return `Employee: ${employeeName}\n\nRecords the manager selected:\n\n${sections}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const accountId = process.env.CF_ACCOUNT_ID
  const apiToken = process.env.CF_API_TOKEN
  const projectId = process.env.FIREBASE_PROJECT_ID
  const model = process.env.CF_AI_MODEL || DEFAULT_MODEL

  if (!accountId || !apiToken || !projectId) {
    return res.status(500).json({
      error: 'Server not configured. Set CF_ACCOUNT_ID, CF_API_TOKEN and FIREBASE_PROJECT_ID.',
    })
  }

  // This endpoint is publicly reachable, so authenticate the caller before
  // spending any Workers AI quota on them.
  try {
    const authHeader = req.headers.authorization || ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    await verifyFirebaseToken(idToken, projectId)
  } catch (err) {
    return res.status(401).json({ error: `Unauthorized: ${err.message}` })
  }

  const { employeeName, items } = req.body || {}
  if (!employeeName || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'employeeName and a non-empty items array are required.' })
  }

  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(employeeName, items) },
          ],
          max_tokens: 800,
        }),
      },
    )

    const payload = await cfRes.json()
    if (!cfRes.ok || payload.success === false) {
      const detail = payload.errors?.map((e) => e.message).join('; ') || `HTTP ${cfRes.status}`
      return res.status(502).json({ error: `Workers AI request failed: ${detail}` })
    }

    const email = extractEmail(payload.result, employeeName)
    if (!email) return res.status(502).json({ error: 'Workers AI returned an empty response.' })
    return res.status(200).json(email)
  } catch (err) {
    return res.status(502).json({ error: `Workers AI request failed: ${err.message}` })
  }
}

// Workers AI's response shape varies: `result.response` is a plain string on
// older models, but an already-parsed object when the model emits clean JSON,
// and some models only populate the OpenAI-style `choices` array. Exported for
// tests.
export function extractEmail(result, employeeName) {
  const fallbackSubject = `Catching up — ${employeeName}`
  const raw = result?.response ?? result?.choices?.[0]?.message?.content

  // Already-parsed object with the fields we asked for.
  if (raw && typeof raw === 'object') {
    if (typeof raw.body === 'string' && raw.body) {
      return { subject: typeof raw.subject === 'string' && raw.subject ? raw.subject : fallbackSubject, body: raw.body }
    }
    return null
  }

  if (typeof raw !== 'string' || !raw.trim()) return null

  // Models often wrap JSON in prose or code fences despite instructions.
  // Fall back to using the raw text as the body rather than failing outright.
  const match = /\{[\s\S]*\}/.exec(raw)
  if (match) {
    try {
      const parsed = JSON.parse(match[0])
      if (typeof parsed.body === 'string' && parsed.body) {
        return { subject: typeof parsed.subject === 'string' && parsed.subject ? parsed.subject : fallbackSubject, body: parsed.body }
      }
    } catch {
      // fall through to raw text
    }
  }
  return { subject: fallbackSubject, body: raw.trim() }
}
