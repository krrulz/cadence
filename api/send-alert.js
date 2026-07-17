import nodemailer from 'nodemailer'
import { verifyFirebaseToken } from './_verifyFirebaseToken.js'

// Sends a notification email via a user-supplied SMTP server. Entirely optional:
// with no SMTP_* env vars set, the endpoint returns `{ skipped: true }` and the
// UI carries on — alerts are best-effort and never block an action.
//
// Required env (server-side only, no VITE_ prefix):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//   FIREBASE_PROJECT_ID (shared with the other functions)
// Optional: SMTP_SECURE ('true' for implicit TLS / port 465)

function isConfigured() {
  return ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].every((k) => process.env[k])
}

let transporter
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transporter
}

// Basic guard so the endpoint can't be turned into an open relay: only allow a
// small, sane number of recipients and require a subject + body.
const MAX_RECIPIENTS = 10

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Authenticate the caller — only signed-in users may trigger mail.
  const projectId = process.env.FIREBASE_PROJECT_ID
  try {
    const authHeader = req.headers.authorization || ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    await verifyFirebaseToken(idToken, projectId)
  } catch (err) {
    return res.status(401).json({ error: `Unauthorized: ${err.message}` })
  }

  if (!isConfigured()) {
    // Not an error — the feature is simply switched off.
    return res.status(200).json({ skipped: true, reason: 'SMTP not configured' })
  }

  const { to, subject, text, html } = req.body || {}
  const recipients = (Array.isArray(to) ? to : [to]).filter((x) => typeof x === 'string' && x.includes('@'))
  if (recipients.length === 0) return res.status(400).json({ error: 'No valid recipient.' })
  if (recipients.length > MAX_RECIPIENTS) return res.status(400).json({ error: 'Too many recipients.' })
  if (!subject || (!text && !html)) return res.status(400).json({ error: 'subject and body are required.' })

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM,
      to: recipients.join(', '),
      subject: String(subject).slice(0, 200),
      text: text ? String(text) : undefined,
      html: html ? String(html) : undefined,
    })
    return res.status(200).json({ ok: true, sent: recipients.length })
  } catch (err) {
    return res.status(502).json({ error: `Send failed: ${err.message}` })
  }
}
