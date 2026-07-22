import { useCallback, useEffect, useMemo, useState } from 'react'
import Section from './Section.jsx'
import Modal from './Modal.jsx'
import StatusBadge from './StatusBadge.jsx'
import { LabeledInput, LabeledTextarea, FormActions } from './FormFields.jsx'
import { getRecordsForEmployee, addRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers.js'
import { GOAL_STATUSES } from '../lib/constants.js'

// Progress is derived from key results when present (done / total), otherwise
// it falls back to the manually entered percentage on the goal.
function goalProgress(goal) {
  const krs = goal.keyResults || []
  if (krs.length) return Math.round((krs.filter((k) => k.done).length / krs.length) * 100)
  return Number(goal.progress) || 0
}

// Active goals first, then by due date (soonest first, undated last).
function sortGoals(goals) {
  return [...goals].sort((a, b) => {
    const aDone = a.status === 'Completed'
    const bDone = b.status === 'Completed'
    if (aDone !== bDone) return aDone ? 1 : -1
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
  })
}

// Collaborative goals/OKRs for one employee. Both the employee and the admin
// can add, edit, tick key results and delete. `viewer` is the current user.
export default function Goals({ employeeId, viewer }) {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | { type:'add' } | { type:'edit', data }

  const loadData = useCallback(async () => {
    setLoading(true)
    const items = await getRecordsForEmployee('goals', employeeId)
    setGoals(items)
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const sorted = useMemo(() => sortGoals(goals), [goals])

  // Optimistic toggle of a single key result.
  async function toggleKeyResult(goal, index) {
    const nextKRs = goal.keyResults.map((k, i) => (i === index ? { ...k, done: !k.done } : k))
    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, keyResults: nextKRs } : g)))
    try {
      await updateRecord('goals', goal.id, { keyResults: nextKRs, updatedAt: new Date().toISOString() })
    } catch {
      loadData() // roll back to server truth on failure
    }
  }

  async function handleDelete(id) {
    await deleteRecord('goals', id)
    loadData()
  }

  return (
    <Section title="Goals & OKRs" onAdd={() => setModal({ type: 'add' })} addLabel="+ Add Goal">
      {loading ? (
        <p className="text-sm text-ink-faint">Loading goals…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-ink-faint">No goals set yet.</p>
      ) : (
        <ul className="space-y-4">
          {sorted.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onToggleKR={(i) => toggleKeyResult(goal, i)}
              onEdit={() => setModal({ type: 'edit', data: goal })}
              onDelete={() => handleDelete(goal.id)}
            />
          ))}
        </ul>
      )}

      {modal && (
        <GoalModal
          goal={modal.type === 'edit' ? modal.data : null}
          employeeId={employeeId}
          viewer={viewer}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
    </Section>
  )
}

function GoalCard({ goal, onToggleKR, onEdit, onDelete }) {
  const progress = goalProgress(goal)
  return (
    <li className="rounded-lg border border-surface-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium text-ink">{goal.objective}</h4>
            <StatusBadge label={goal.status} />
          </div>
          {goal.description && <p className="mt-1 text-sm text-ink-muted">{goal.description}</p>}
        </div>
        <div className="flex shrink-0 gap-3 text-sm">
          <button type="button" onClick={onEdit} className="text-ink-muted hover:text-mint hover:underline">
            Edit
          </button>
          <button type="button" onClick={onDelete} className="text-ink-faint hover:text-rose-400 hover:underline">
            Delete
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>Progress</span>
          <span className="font-medium text-ink">{progress}%</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {goal.keyResults?.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {goal.keyResults.map((kr, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-mint"
                checked={!!kr.done}
                onChange={() => onToggleKR(i)}
                aria-label={`Toggle key result: ${kr.text}`}
              />
              <span className={kr.done ? 'text-ink-faint line-through' : 'text-ink'}>{kr.text}</span>
            </li>
          ))}
        </ul>
      )}

      {goal.dueDate && (
        <p className="mt-3 text-xs text-ink-faint">
          Due {goal.dueDate}
          {goal.ownerName ? ` · set by ${goal.ownerName}` : ''}
        </p>
      )}
    </li>
  )
}

function GoalModal({ goal, employeeId, viewer, onClose, onSaved }) {
  const [form, setForm] = useState({
    objective: goal?.objective || '',
    description: goal?.description || '',
    status: goal?.status || GOAL_STATUSES[0],
    dueDate: goal?.dueDate || '',
    progress: goal?.progress ?? 0,
  })
  // Key results as editable text lines; blank lines are dropped on save.
  const [keyResults, setKeyResults] = useState(
    goal?.keyResults?.length ? goal.keyResults.map((k) => ({ ...k })) : [{ text: '', done: false }],
  )
  const [submitting, setSubmitting] = useState(false)

  const hasKRs = keyResults.some((k) => k.text.trim())
  // Can't call a goal Completed while any of its key results is still open.
  const openKRs = keyResults.filter((k) => k.text.trim() && !k.done)
  const blockedComplete = form.status === 'Completed' && openKRs.length > 0

  function setKR(i, text) {
    setKeyResults((prev) => prev.map((k, idx) => (idx === i ? { ...k, text } : k)))
  }
  function addKR() {
    setKeyResults((prev) => [...prev, { text: '', done: false }])
  }
  function removeKR(i) {
    setKeyResults((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (blockedComplete) return
    setSubmitting(true)
    const cleanKRs = keyResults.filter((k) => k.text.trim()).map((k) => ({ text: k.text.trim(), done: !!k.done }))
    const data = {
      objective: form.objective.trim(),
      description: form.description.trim(),
      status: form.status,
      dueDate: form.dueDate,
      // Manual progress only matters when there are no key results to derive it.
      progress: cleanKRs.length ? 0 : Number(form.progress) || 0,
      keyResults: cleanKRs,
      updatedAt: new Date().toISOString(),
    }
    if (goal) {
      await updateRecord('goals', goal.id, data)
    } else {
      await addRecord('goals', {
        ...data,
        employeeId,
        ownerName: viewer?.name || '',
        createdByUid: viewer?.uid || '',
        createdByRole: viewer?.role || '',
        createdAt: new Date().toISOString(),
      })
    }
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title={goal ? 'Edit Goal' : 'Add Goal'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LabeledInput
          label="Objective"
          required
          value={form.objective}
          onChange={(v) => setForm((f) => ({ ...f, objective: v }))}
          placeholder="e.g. Improve onboarding experience"
        />
        <LabeledTextarea label="Description" value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-ink">Status</span>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="input mt-1">
              {GOAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <LabeledInput label="Due date" type="date" value={form.dueDate} onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))} />
        </div>

        {blockedComplete && (
          <p className="rounded-md bg-amber-500/10 p-2 text-sm text-amber-300">
            {openKRs.length} key result{openKRs.length === 1 ? '' : 's'} still open — tick them all off before marking
            this goal <strong>Completed</strong>.
          </p>
        )}

        <div>
          <span className="text-sm font-medium text-ink">Key results</span>
          <p className="text-xs text-ink-faint">Progress is calculated from these. Leave empty to set progress manually.</p>
          <div className="mt-2 space-y-2">
            {keyResults.map((kr, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={kr.text}
                  onChange={(e) => setKR(i, e.target.value)}
                  className="input flex-1"
                  placeholder={`Key result ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeKR(i)}
                  className="shrink-0 rounded-md px-2 py-1 text-ink-faint hover:text-rose-400"
                  aria-label="Remove key result"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addKR} className="mt-2 text-sm text-mint hover:underline">
            + Add key result
          </button>
        </div>

        {!hasKRs && (
          <label className="block text-sm">
            <span className="font-medium text-ink">Progress ({form.progress}%)</span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={form.progress}
              onChange={(e) => setForm((f) => ({ ...f, progress: e.target.value }))}
              className="mt-1 w-full accent-mint"
            />
          </label>
        )}

        <FormActions submitting={submitting || blockedComplete} onCancel={onClose} />
      </form>
    </Modal>
  )
}
