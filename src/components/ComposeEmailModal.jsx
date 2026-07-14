import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { auth } from '../firebase.js'

const GROUP_ORDER = ['performance', 'grievances', 'recognitions', 'feedback', 'leaves']
const GROUP_LABELS = {
  performance: 'Performance & Achievements',
  grievances: 'Grievances',
  recognitions: 'Recognitions',
  feedback: 'Feedback',
  leaves: 'Leave',
}

function buildBody(employeeName, items) {
  const byGroup = {}
  for (const item of items) {
    ;(byGroup[item.collection] ||= []).push(item)
  }

  const sections = GROUP_ORDER.filter((g) => byGroup[g]?.length).map((g) => {
    const lines = byGroup[g].map((item) => `  • ${item.summary}`).join('\n')
    return `${GROUP_LABELS[g]}:\n${lines}`
  })

  return `Summary for ${employeeName}\n\n${sections.join('\n\n')}\n`
}

export default function ComposeEmailModal({ employee, items, onClose }) {
  const defaultSubject = `Summary for ${employee.name} — ${new Date().toISOString().slice(0, 10)}`
  const defaultBody = useMemo(() => buildBody(employee.name, items), [employee.name, items])

  const [to, setTo] = useState(employee.email || '')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(defaultBody)
  const [copied, setCopied] = useState(false)
  const [rewriting, setRewriting] = useState(false)
  const [aiError, setAiError] = useState('')

  const mailtoHref = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  async function handleCopy() {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleRewrite() {
    setAiError('')
    setRewriting(true)
    try {
      const idToken = await auth.currentUser.getIdToken()
      const res = await fetch('/api/compose-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ employeeName: employee.name, items }),
      })

      // Don't assume the response is JSON — a missing/misconfigured endpoint
      // returns an empty body or an HTML error page, and blindly calling
      // res.json() there throws a parse error that hides the real cause.
      const raw = await res.text()
      let data = null
      try {
        data = raw ? JSON.parse(raw) : null
      } catch {
        // leave data null; handled below
      }

      if (res.status === 404) {
        throw new Error(
          'The /api/compose-email endpoint was not found. It only runs on Vercel or via `npm run dev` with the api-dev-server plugin — a plain static preview will not serve it.',
        )
      }
      if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status} ${res.statusText || ''})`.trim())
      }
      if (!data?.body) {
        throw new Error('The server returned an unexpected response.')
      }

      if (data.subject) setSubject(data.subject)
      setBody(data.body)
    } catch (err) {
      setAiError(`${err.message}. The draft below is unchanged — you can still edit and send it.`)
    } finally {
      setRewriting(false)
    }
  }

  function handleReset() {
    setSubject(defaultSubject)
    setBody(defaultBody)
    setAiError('')
  }

  return (
    <Modal title="Compose Email" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">
            {items.length} item{items.length === 1 ? '' : 's'} selected.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={handleReset} className="btn-secondary text-xs">
              Reset to plain summary
            </button>
            <button type="button" onClick={handleRewrite} disabled={rewriting} className="btn-primary text-xs">
              {rewriting ? 'Writing…' : '✨ Rewrite with AI'}
            </button>
          </div>
        </div>

        {aiError && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{aiError}</p>}

        <label className="block text-sm">
          <span className="font-medium text-slate-700">To</span>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input mt-1"
            placeholder="recipient@company.com"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input mt-1" />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">Body</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={12}
            className="input mt-1 text-sm"
          />
        </label>

        <p className="text-xs text-slate-400">
          AI drafts are a starting point — read before sending. Nothing is sent anywhere until you click below.
        </p>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
          <button type="button" onClick={handleCopy} className="btn-secondary">
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
          <a href={mailtoHref} className="btn-primary">
            Open in email client
          </a>
        </div>
      </div>
    </Modal>
  )
}
