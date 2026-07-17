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

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// `viewer` = { uid, name, role: 'admin' | 'employee' }. `canSchedule` gates the
// "Schedule 1:1" button (admin only); employees contribute to existing ones.
export default function OneOnOnes({ employeeId, viewer, canSchedule }) {
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
        <p className="py-6 text-center text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-slate-400">No 1:1s yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((o) => (
            <div key={o.id} className="rounded-md border border-slate-200">
              <button
                type="button"
                onClick={() => setOpenId(openId === o.id ? null : o.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{o.title || '1:1 Meeting'}</span>
                  <span className="ml-2 text-sm text-slate-500">{o.date}</span>
                </span>
                <span className="text-slate-400">{openId === o.id ? '▲' : '▼'}</span>
              </button>
              {openId === o.id && (
                <OneOnOnePanel
                  oneOnOne={o}
                  viewer={viewer}
                  canDelete={canSchedule}
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

// The collaborative detail: a shared agenda, an author-tagged notes stream, and
// checkable action items. Loads the two subcollections on mount.
function OneOnOnePanel({ oneOnOne, viewer, canDelete, onDeleted }) {
  const [notes, setNotes] = useState([])
  const [actions, setActions] = useState([])
  const [agenda, setAgenda] = useState(oneOnOne.agenda || '')
  const [newNote, setNewNote] = useState('')
  const [newAction, setNewAction] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [n, a] = await Promise.all([
      getSubRecords('oneOnOnes', oneOnOne.id, 'notes'),
      getSubRecords('oneOnOnes', oneOnOne.id, 'actions'),
    ])
    setNotes(sortByDateDesc(n, 'createdAt'))
    setActions([...a].sort((x, y) => (x.createdAt || '').localeCompare(y.createdAt || '')))
    setLoading(false)
  }, [oneOnOne.id])

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
    if (!newAction.trim()) return
    await addSubRecord('oneOnOnes', oneOnOne.id, 'actions', {
      text: newAction.trim(),
      owner: viewer.role,
      createdByUid: viewer.uid,
      createdByName: viewer.name,
      done: false,
      createdAt: new Date().toISOString(),
    })
    setNewAction('')
    load()
  }

  async function toggleAction(item) {
    // Optimistic — the done-only update is permitted for any participant.
    setActions((prev) => prev.map((a) => (a.id === item.id ? { ...a, done: !a.done } : a)))
    await updateSubRecord('oneOnOnes', oneOnOne.id, 'actions', item.id, { done: !item.done })
  }

  async function removeAction(item) {
    await deleteSubRecord('oneOnOnes', oneOnOne.id, 'actions', item.id)
    load()
  }

  async function deleteMeeting() {
    if (!window.confirm('Delete this 1:1 and all its notes and action items?')) return
    await deleteRecord('oneOnOnes', oneOnOne.id)
    onDeleted()
  }

  return (
    <div className="space-y-4 border-t border-slate-100 p-3">
      {loading ? (
        <p className="py-2 text-sm text-slate-400">Loading…</p>
      ) : (
        <>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Agenda (shared)</label>
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
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Action items</p>
            <div className="space-y-1">
              {actions.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand"
                    checked={!!item.done}
                    onChange={() => toggleAction(item)}
                  />
                  <span className={item.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{item.text}</span>
                  <span className="rounded-full bg-slate-100 px-1.5 text-[10px] uppercase text-slate-500">
                    {item.owner}
                  </span>
                  {(item.createdByUid === viewer.uid || viewer.role === 'admin') && (
                    <button
                      type="button"
                      onClick={() => removeAction(item)}
                      className="text-xs text-slate-400 hover:text-red-600"
                      aria-label="Delete action item"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {actions.length === 0 && <p className="text-sm text-slate-400">No action items.</p>}
            </div>
            <form onSubmit={addAction} className="mt-2 flex gap-2">
              <input
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                placeholder="Add an action item…"
                className="input text-sm"
              />
              <button type="submit" className="btn-secondary text-xs">
                Add
              </button>
            </form>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
            <div className="space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-md bg-slate-50 p-2 text-sm">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">
                      {note.authorName}
                      <span className="ml-1 text-slate-400">· {note.authorRole}</span>
                    </span>
                    {(note.authorUid === viewer.uid || viewer.role === 'admin') && (
                      <button
                        type="button"
                        onClick={() => removeNote(note)}
                        className="text-xs text-slate-400 hover:text-red-600"
                        aria-label="Delete note"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-slate-700">{note.text}</p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}
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

          {canDelete && (
            <div className="flex justify-end border-t border-slate-100 pt-2">
              <button type="button" onClick={deleteMeeting} className="text-xs text-red-600 hover:underline">
                Delete this 1:1
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
