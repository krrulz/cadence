import { useMemo, useState } from 'react'
import { SKILL_CATEGORIES, SKILL_CATALOG, SKILL_LEVELS } from '../lib/constants.js'

// Public, no-login Skill Survey for employees who don't have Cadence access
// yet. Flow: passcode -> pick your name -> confirm it's you -> rate skills ->
// submit. Writes go through api/skill-survey.js (Admin SDK), never directly
// to Firestore from the browser, so the real `skills` rules stay untouched.

function key(category, name) {
  return `${category}::${name}`
}

// Clickable 1–5 rating. Clicking the currently-topmost active pip clears it
// back to unrated (0) — the natural way to back out of an accidental tap.
function Pips({ level, onSet }) {
  return (
    <div className="flex items-center gap-1">
      {SKILL_LEVELS.map((l) => (
        <button
          key={l.n}
          type="button"
          title={`${l.n} · ${l.label}`}
          aria-label={`Set level ${l.n} (${l.label})`}
          onClick={() => onSet(l.n === level ? 0 : l.n)}
          className={`h-2.5 w-6 rounded-full transition-colors ${
            l.n <= level ? 'bg-gradient-to-r from-mint-deep to-mint' : 'bg-white/10 hover:bg-white/20'
          }`}
        />
      ))}
    </div>
  )
}

const LEVEL_LABEL = Object.fromEntries(SKILL_LEVELS.map((l) => [l.n, l.label]))

export default function SkillSurvey() {
  const [step, setStep] = useState('passcode') // passcode | pick | confirm | form | done
  const [passcode, setPasscode] = useState('')
  const [passcodeError, setPasscodeError] = useState('')
  const [checking, setChecking] = useState(false)
  const [employees, setEmployees] = useState([])
  // Seeded catalog by default (so the form isn't empty before the fetch
  // resolves); replaced by the server's merged catalog — seed topics plus
  // anything added via bulk import or the in-app Skill Matrix — once the
  // passcode check succeeds. Re-fetched fresh every time the page loads.
  const [catalog, setCatalog] = useState(SKILL_CATALOG)
  const [employeeId, setEmployeeId] = useState('')
  const [levels, setLevels] = useState({}) // `${category}::${name}` -> 1-5
  const [customEntries, setCustomEntries] = useState([]) // { id, category, name, level }
  const [customDraft, setCustomDraft] = useState({}) // category -> draft text
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const selectedEmployee = employees.find((e) => e.id === employeeId)

  async function checkPasscode(e) {
    e.preventDefault()
    setPasscodeError('')
    setChecking(true)
    try {
      const res = await fetch(`/api/skill-survey?passcode=${encodeURIComponent(passcode)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not verify passcode.')
      setEmployees(data.employees || [])
      if (data.catalog) setCatalog(data.catalog)
      setStep('pick')
    } catch (err) {
      setPasscodeError(err.message)
    } finally {
      setChecking(false)
    }
  }

  function setLevel(category, name, level) {
    setLevels((prev) => {
      const k = key(category, name)
      if (!level) {
        const next = { ...prev }
        delete next[k]
        return next
      }
      return { ...prev, [k]: level }
    })
  }

  function addCustom(category) {
    const name = (customDraft[category] || '').trim()
    if (!name) return
    setCustomEntries((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, category, name, level: 3 }])
    setCustomDraft((prev) => ({ ...prev, [category]: '' }))
  }
  function setCustomLevel(id, level) {
    setCustomEntries((prev) => prev.map((c) => (c.id === id ? { ...c, level } : c)))
  }
  function removeCustom(id) {
    setCustomEntries((prev) => prev.filter((c) => c.id !== id))
  }

  const totalRated = useMemo(
    () => Object.keys(levels).length + customEntries.filter((c) => c.level > 0).length,
    [levels, customEntries],
  )

  async function handleSubmit() {
    const entries = []
    for (const category of SKILL_CATEGORIES) {
      for (const name of catalog[category] || []) {
        const lvl = levels[key(category, name)]
        if (lvl) entries.push({ category, name, level: lvl })
      }
    }
    for (const c of customEntries) {
      if (c.name.trim() && c.level) entries.push({ category: c.category, name: c.name.trim(), level: c.level })
    }
    if (entries.length === 0) {
      setSubmitError('Rate at least one skill before submitting.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/skill-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode, employeeId, entries }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not submit.')
      setStep('done')
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function restart() {
    setStep('pick')
    setEmployeeId('')
    setLevels({})
    setCustomEntries([])
    setSubmitError('')
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-surface px-4 py-10">
      <div
        className="animate-floaty pointer-events-none fixed -left-16 top-[8%] h-72 w-72 rounded-full bg-brand/20 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="animate-floaty-slow pointer-events-none fixed -right-20 bottom-[8%] h-80 w-80 rounded-full bg-accent/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Cadence Skill Survey</h1>
          <p className="mt-1 text-sm text-ink-muted">Capture your technical, functional and soft skills.</p>
        </div>

        {step === 'passcode' && (
          <div className="mx-auto max-w-sm rounded-2xl border border-surface-border bg-surface-2/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <p className="mb-4 text-center text-sm text-ink-muted">Enter the access code you were given.</p>
            <form onSubmit={checkPasscode} className="space-y-4">
              <input
                type="password"
                required
                autoFocus
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Access code"
                className="input text-center"
              />
              {passcodeError && <p className="text-center text-sm text-rose-400">{passcodeError}</p>}
              <button type="submit" disabled={checking} className="btn-primary w-full">
                {checking ? 'Checking…' : 'Continue'}
              </button>
            </form>
          </div>
        )}

        {step === 'pick' && (
          <div className="mx-auto max-w-sm rounded-2xl border border-surface-border bg-surface-2/85 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <p className="mb-4 text-center text-sm text-ink-muted">Who is filling this out?</p>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="input">
              <option value="">Select your name…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!employeeId}
              onClick={() => setStep('confirm')}
              className="btn-primary mt-4 w-full disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'confirm' && selectedEmployee && (
          <div className="mx-auto max-w-sm rounded-2xl border border-surface-border bg-surface-2/85 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-8">
            <p className="text-sm text-ink-muted">You&apos;re about to fill this out as</p>
            <p className="mt-2 text-xl font-bold text-ink">{selectedEmployee.name}</p>
            <p className="mt-1 text-sm text-ink-faint">Please double-check this is you before continuing.</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmployeeId('')
                  setStep('pick')
                }}
                className="btn-secondary flex-1"
              >
                Not me
              </button>
              <button type="button" onClick={() => setStep('form')} className="btn-primary flex-1">
                Yes, this is me
              </button>
            </div>
          </div>
        )}

        {step === 'form' && selectedEmployee && (
          <div className="space-y-4">
            <div className="rounded-xl border border-surface-border bg-surface-2/70 p-3 text-sm text-ink-muted">
              Filling out as <span className="font-semibold text-ink">{selectedEmployee.name}</span>. Only rate the
              skills that apply to you — leave the rest blank. Click a set pip again to clear it.
            </div>

            {SKILL_CATEGORIES.map((category) => (
              <div key={category} className="card">
                <h2 className="mb-3 font-semibold text-ink">{category}</h2>
                <ul className="divide-y divide-white/5">
                  {(catalog[category] || []).map((name) => {
                    const lvl = levels[key(category, name)] || 0
                    return (
                      <li key={name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="text-sm text-ink">{name}</span>
                        <span className="flex items-center gap-2">
                          <Pips level={lvl} onSet={(n) => setLevel(category, name, n)} />
                          <span className="w-20 text-right text-xs text-ink-faint">{lvl ? LEVEL_LABEL[lvl] : '—'}</span>
                        </span>
                      </li>
                    )
                  })}
                  {customEntries
                    .filter((c) => c.category === category)
                    .map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="text-sm text-ink">{c.name}</span>
                        <span className="flex items-center gap-2">
                          <Pips level={c.level} onSet={(n) => setCustomLevel(c.id, n)} />
                          <span className="w-20 text-right text-xs text-ink-faint">{LEVEL_LABEL[c.level]}</span>
                          <button
                            type="button"
                            onClick={() => removeCustom(c.id)}
                            className="text-ink-faint hover:text-rose-400"
                            aria-label={`Remove ${c.name}`}
                          >
                            ✕
                          </button>
                        </span>
                      </li>
                    ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <input
                    value={customDraft[category] || ''}
                    onChange={(e) => setCustomDraft((prev) => ({ ...prev, [category]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addCustom(category)
                      }
                    }}
                    placeholder={`Add another ${category.toLowerCase()} skill…`}
                    className="input flex-1 text-sm"
                  />
                  <button type="button" onClick={() => addCustom(category)} className="btn-secondary text-xs">
                    + Add
                  </button>
                </div>
              </div>
            ))}

            <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-border bg-surface-2/95 p-3 shadow-2xl backdrop-blur-xl">
              <span className="text-sm text-ink-muted">{totalRated} skill{totalRated === 1 ? '' : 's'} rated</span>
              {submitError && <span className="text-sm text-rose-400">{submitError}</span>}
              <button type="button" onClick={handleSubmit} disabled={submitting} className="btn-primary">
                {submitting ? 'Submitting…' : 'Submit skill survey'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="mx-auto max-w-sm rounded-2xl border border-surface-border bg-surface-2/85 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-8">
            <p className="text-xl font-bold text-ink">✓ Thanks!</p>
            <p className="mt-2 text-sm text-ink-muted">
              Your skills have been recorded in {selectedEmployee?.name}&apos;s skill matrix.
            </p>
            <button type="button" onClick={restart} className="btn-secondary mt-5 w-full">
              Submit for someone else
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
