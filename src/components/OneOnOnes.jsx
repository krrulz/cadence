import { useCallback, useEffect, useState } from 'react'
import Section from './Section.jsx'
import Modal from './Modal.jsx'
import { LabeledInput } from './FormFields.jsx'
import {
  getRecordsForEmployee,
  addRecord,
  updateRecord,
  deleteRecord,
  getSubRecords,
  addSubRecord,
  updateSubRecord,
  deleteSubRecord,
} from '../lib/firestoreHelpers.js'
import { sortByDateDesc } from '../lib/aggregate.js'
import { sendAlert, getAdminEmails } from '../lib/notify.js'
import { GOAL_STATUSES } from '../lib/constants.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Build a plain-text Minutes of Meeting from a 1:1 and its notes/actions.
function buildMinutes(oneOnOne, notes, actions, employeeName) {
  const lines = []
  lines.push(`1:1 Meeting — ${oneOnOne.title || '1:1'}`)
  lines.push(`With: ${employeeName || ''}`)
  lines.push(`Date: ${oneOnOne.date}`)
  if (oneOnOne.agenda) {
    lines.push('', 'Agenda:', oneOnOne.agenda)
  }
  lines.push('', 'Notes:')
  if (notes.length) notes.forEach((n) => lines.push(`  • ${n.authorName} (${n.authorRole}): ${n.text}`))
  else lines.push('  • (none)')
  lines.push('', 'Action items:')
  if (actions.length)
    actions.forEach((a) =>
      lines.push(`  • [${a.done ? 'x' : ' '}] ${a.text}${a.goalObjective ? `  → Goal: ${a.goalObjective}` : ''}`),
    )
  else lines.push('  • (none)')
  lines.push('', '— Sent from Cadence')
  return lines.join('\n')
}

// `viewer` = { uid, name, role: 'admin' | 'employee' }. `canSchedule` gates the
// "Schedule 1:1" button (admin only); employees contribute to existing ones.
// `employeeEmail`/`employeeName` identify the 1:1's employee for the MoM email.
export default function OneOnOnes({ employeeId, viewer, canSchedule, employeeEmail, employeeName }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [scheduling, setScheduling] = useState(false)
  const [openId, setOpenId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await getRecordsForEmployee('oneOnOnes', employeeId)
    setItems(sortByDateDesc(rows, 'date'))
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <Section
      title="1:1 Meetings"
      onAdd={canSchedule ? () => setScheduling(true) : undefined}
      addLabel="+ Schedule 1:1"
    >
      {loading ? (
        <p className="py-6 text-center text-ink-faint">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-ink-faint">No 1:1s yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((o) => (
            <div key={o.id} className="rounded-md border border-surface-border">
              <button
                type="button"
                onClick={() => setOpenId(openId === o.id ? null : o.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="font-medium text-ink">{o.title || '1:1 Meeting'}</span>
                  <span className="ml-2 text-sm text-ink-muted">{o.date}</span>
                  {o.completed && (
                    <span className="ml-2 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      ✓ Completed
                    </span>
                  )}
                </span>
                <span className="text-ink-faint">{openId === o.id ? '▲' : '▼'}</span>
              </button>
              {openId === o.id && (
                <OneOnOnePanel
                  oneOnOne={o}
                  employeeId={employeeId}
                  viewer={viewer}
                  employeeEmail={employeeEmail}
                  employeeName={employeeName}
                  canDelete={canSchedule}
                  onChanged={load}
                  onDeleted={() => {
                    setOpenId(null)
                    load()
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {scheduling && (
        <ScheduleModal
          employeeId={employeeId}
          viewer={viewer}
          onClose={() => setScheduling(false)}
          onSaved={load}
        />
      )}
    </Section>
  )
}

function ScheduleModal({ employeeId, viewer, onClose, onSaved }) {
  const [date, setDate] = useState(todayISO())
  const [title, setTitle] = useState('Weekly 1:1')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    await addRecord('oneOnOnes', {
      employeeId,
      date,
      title,
      agenda: '',
      createdBy: viewer.uid,
      createdAt: new Date().toISOString(),
    })
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Schedule 1:1" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LabeledInput label="Date" type="date" required value={date} onChange={setDate} />
        <LabeledInput label="Title" value={title} onChange={setTitle} placeholder="e.g. Weekly 1:1" />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Saving…' : 'Schedule'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// The collaborative detail: a shared agenda, an author-tagged notes stream,
// checkable action items (optionally linked to a goal's key results), and a
// completion control that can email the minutes. Loads the two subcollections
// plus the employee's goals on mount.
function OneOnOnePanel({ oneOnOne, employeeId, viewer, employeeEmail, employeeName, canDelete, onChanged, onDeleted }) {
  const [notes, setNotes] = useState([])
  const [actions, setActions] = useState([])
  const [goals, setGoals] = useState([])
  const [agenda, setAgenda] = useState(oneOnOne.agenda || '')
  const [newNote, setNewNote] = useState('')
  const [newAction, setNewAction] = useState('')
  const [linkGoalId, setLinkGoalId] = useState('') // '' | goalId | '__new__'
  const [newGoalObjective, setNewGoalObjective] = useState('')
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [emailMinutes, setEmailMinutes] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [n, a, g] = await Promise.all([
      getSubRecords('oneOnOnes', oneOnOne.id, 'notes'),
      getSubRecords('oneOnOnes', oneOnOne.id, 'actions'),
      getRecordsForEmployee('goals', employeeId),
    ])
    setNotes(sortByDateDesc(n, 'createdAt'))
    setActions([...a].sort((x, y) => (x.createdAt || '').localeCompare(y.createdAt || '')))
    setGoals(g)
    setLoading(false)
  }, [oneOnOne.id, employeeId])

  useEffect(() => {
    load()
  }, [load])

  async function saveAgenda() {
    if (agenda === (oneOnOne.agenda || '')) return
    await updateRecord('oneOnOnes', oneOnOne.id, { agenda })
  }

  async function addNote(e) {
    e.preventDefault()
    if (!newNote.trim()) return
    await addSubRecord('oneOnOnes', oneOnOne.id, 'notes', {
      authorUid: viewer.uid,
      authorName: viewer.name,
      authorRole: viewer.role,
      text: newNote.trim(),
      createdAt: new Date().toISOString(),
    })
    setNewNote('')
    load()
  }

  async function removeNote(note) {
    await deleteSubRecord('oneOnOnes', oneOnOne.id, 'notes', note.id)
    load()
  }

  async function addAction(e) {
    e.preventDefault()
    const text = newAction.trim()
    if (!text) return

    // Optionally map the action to a goal's key results: append it to an
    // existing goal, or spin up a new goal with this as its first key result.
    let goalId = ''
    let goalObjective = ''
    try {
      if (linkGoalId === '__new__') {
        const objective = newGoalObjective.trim() || text
        const ref = await addRecord('goals', {
          employeeId,
          objective,
          description: '',
          status: GOAL_STATUSES[1] || 'In Progress',
          dueDate: '',
          progress: 0,
          keyResults: [{ text, done: false }],
          ownerName: viewer.name || '',
          createdByUid: viewer.uid || '',
          createdByRole: viewer.role || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        goalId = ref.id
        goalObjective = objective
      } else if (linkGoalId) {
        const goal = goals.find((g) => g.id === linkGoalId)
        if (goal) {
          const nextKRs = [...(goal.keyResults || []), { text, done: false }]
          await updateRecord('goals', goal.id, { keyResults: nextKRs, updatedAt: new Date().toISOString() })
          goalId = goal.id
          goalObjective = goal.objective
        }
      }
    } catch {
      // If the goal write fails, still record the action without a link.
      goalId = ''
      goalObjective = ''
    }

    await addSubRecord('oneOnOnes', oneOnOne.id, 'actions', {
      text,
      owner: viewer.role,
      createdByUid: viewer.uid,
      createdByName: viewer.name,
      done: false,
      createdAt: new Date().toISOString(),
      ...(goalId ? { goalId, goalObjective } : {}),
    })
    setNewAction('')
    setLinkGoalId('')
    setNewGoalObjective('')
    load()
  }

  async function toggleAction(item) {
    const done = !item.done
    // Optimistic — the done-only update is permitted for any participant.
    setActions((prev) => prev.map((a) => (a.id === item.id ? { ...a, done } : a)))
    await updateSubRecord('oneOnOnes', oneOnOne.id, 'actions', item.id, { done })
    // Keep the mapped key result in sync (best-effort).
    if (item.goalId) {
      try {
        const goal = goals.find((g) => g.id === item.goalId)
        if (goal?.keyResults) {
          const nextKRs = goal.keyResults.map((kr) => (kr.text === item.text ? { ...kr, done } : kr))
          await updateRecord('goals', goal.id, { keyResults: nextKRs, updatedAt: new Date().toISOString() })
          setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, keyResults: nextKRs } : g)))
        }
      } catch {
        /* ignore sync failures */
      }
    }
  }

  async function removeAction(item) {
    await deleteSubRecord('oneOnOnes', oneOnOne.id, 'actions', item.id)
    load()
  }

  async function completeMeeting() {
    await updateRecord('oneOnOnes', oneOnOne.id, { completed: true, completedAt: new Date().toISOString() })
    if (emailMinutes) {
      const admins = await getAdminEmails()
      const recipients = [...new Set([employeeEmail, ...admins].filter(Boolean))]
      sendAlert({
        to: recipients,
        subject: `1:1 Minutes — ${employeeName || ''} (${oneOnOne.date})`,
        text: buildMinutes(oneOnOne, notes, actions, employeeName),
      })
    }
    setCompleting(false)
    onChanged?.()
  }

  async function deleteMeeting() {
    if (!window.confirm('Delete this 1:1 and all its notes and action items?')) return
    await deleteRecord('oneOnOnes', oneOnOne.id)
    onDeleted()
  }

  return (
    <div className="space-y-4 border-t border-white/5 p-3">
      {loading ? (
        <p className="py-2 text-sm text-ink-faint">Loading…</p>
      ) : (
        <>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-ink-muted">Agenda (shared)</label>
            <textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              onBlur={saveAgenda}
              rows={2}
              placeholder="What's this 1:1 about?"
              className="input mt-1 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Action items</p>
            <div className="space-y-1">
              {actions.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-mint"
                    checked={!!item.done}
                    onChange={() => toggleAction(item)}
                  />
                  <span className={item.done ? 'text-ink-faint line-through' : 'text-ink'}>{item.text}</span>
                  <span className="rounded-full bg-white/10 px-1.5 text-[10px] uppercase text-ink-muted">
                    {item.owner}
                  </span>
                  {item.goalObjective && (
                    <span
                      className="rounded-full bg-accent/20 px-1.5 text-[10px] text-accent-200"
                      title={`Linked to goal: ${item.goalObjective}`}
                    >
                      🎯 {item.goalObjective}
                    </span>
                  )}
                  {(item.createdByUid === viewer.uid || viewer.role === 'admin') && (
                    <button
                      type="button"
                      onClick={() => removeAction(item)}
                      className="text-xs text-ink-faint hover:text-rose-400"
                      aria-label="Delete action item"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {actions.length === 0 && <p className="text-sm text-ink-faint">No action items.</p>}
            </div>

            <form onSubmit={addAction} className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                  placeholder="Add an action item…"
                  className="input text-sm"
                />
                <button type="submit" className="btn-secondary text-xs">
                  Add
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-ink-muted">Link to goal:</label>
                <select
                  value={linkGoalId}
                  onChange={(e) => setLinkGoalId(e.target.value)}
                  className="input max-w-[220px] py-1 text-sm"
                >
                  <option value="">No goal link</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.objective}
                    </option>
                  ))}
                  <option value="__new__">＋ New goal…</option>
                </select>
                {linkGoalId === '__new__' && (
                  <input
                    value={newGoalObjective}
                    onChange={(e) => setNewGoalObjective(e.target.value)}
                    placeholder="New goal objective (defaults to action text)"
                    className="input flex-1 py-1 text-sm"
                  />
                )}
              </div>
            </form>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Notes</p>
            <div className="space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-md bg-white/5 p-2 text-sm">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-muted">
                      {note.authorName}
                      <span className="ml-1 text-ink-faint">· {note.authorRole}</span>
                    </span>
                    {(note.authorUid === viewer.uid || viewer.role === 'admin') && (
                      <button
                        type="button"
                        onClick={() => removeNote(note)}
                        className="text-xs text-ink-faint hover:text-rose-400"
                        aria-label="Delete note"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-ink">{note.text}</p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-sm text-ink-faint">No notes yet.</p>}
            </div>
            <form onSubmit={addNote} className="mt-2 flex gap-2">
              <input
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note…"
                className="input text-sm"
              />
              <button type="submit" className="btn-secondary text-xs">
                Add
              </button>
            </form>
          </div>

          {/* Completion + minutes email */}
          <div className="border-t border-white/5 pt-3">
            {oneOnOne.completed ? (
              <p className="text-xs font-medium text-emerald-300">
                ✓ Completed{oneOnOne.completedAt ? ` on ${oneOnOne.completedAt.slice(0, 10)}` : ''}
              </p>
            ) : completing ? (
              <div className="space-y-2 rounded-md bg-white/5 p-3">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-mint"
                    checked={emailMinutes}
                    onChange={(e) => setEmailMinutes(e.target.checked)}
                  />
                  Email the minutes to participants (employee + managers)
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={completeMeeting} className="btn-primary text-xs">
                    Confirm complete
                  </button>
                  <button type="button" onClick={() => setCompleting(false)} className="btn-secondary text-xs">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setCompleting(true)} className="btn-primary text-xs">
                ✓ Complete &amp; email minutes
              </button>
            )}
          </div>

          {canDelete && (
            <div className="flex justify-end border-t border-white/5 pt-2">
              <button type="button" onClick={deleteMeeting} className="text-xs text-rose-400 hover:underline">
                Delete this 1:1
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
