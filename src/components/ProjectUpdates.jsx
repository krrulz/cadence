import { useCallback, useEffect, useState } from 'react'
import Section from './Section.jsx'
import Modal from './Modal.jsx'
import { LabeledInput, LabeledTextarea, FormActions } from './FormFields.jsx'
import { getRecordsForEmployee, addRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers.js'
import { sortByDateDesc } from '../lib/aggregate.js'
import { applyMilestoneToGoal, CLIENT_DELIVERY_OBJECTIVE } from '../lib/goalLinks.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Client-delivery milestones an employee logs about their own work. Each one
// submitted also gets folded into the employee's "Client Delivery" goal as a
// new (completed) key result, auto-creating that goal the first time.
export default function ProjectUpdates({ employeeId, viewer }) {
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | { type:'add' } | { type:'edit', data }

  const loadData = useCallback(async () => {
    setLoading(true)
    const items = await getRecordsForEmployee('projectUpdates', employeeId)
    setUpdates(sortByDateDesc(items, 'date'))
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleDelete(id) {
    if (!window.confirm('Delete this update? It will stay recorded as a key result on the Client Delivery goal.')) return
    await deleteRecord('projectUpdates', id)
    loadData()
  }

  return (
    <Section title="Project Status Updates" onAdd={() => setModal({ type: 'add' })} addLabel="+ Add Milestone">
      <p className="mb-3 -mt-1 text-sm text-ink-muted">
        Log the milestones you hit for client delivery. Each one is also added as a completed key result on your{' '}
        <span className="text-ink">{CLIENT_DELIVERY_OBJECTIVE}</span> goal.
      </p>
      {loading ? (
        <p className="text-sm text-ink-faint">Loading updates…</p>
      ) : updates.length === 0 ? (
        <p className="text-sm text-ink-faint">No milestones logged yet.</p>
      ) : (
        <ul className="space-y-3">
          {updates.map((u) => (
            <li key={u.id} className="rounded-lg border border-surface-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{u.title}</p>
                  {u.description && <p className="mt-1 text-sm text-ink-muted">{u.description}</p>}
                  <p className="mt-1 text-xs text-ink-faint">{u.date}</p>
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button type="button" onClick={() => setModal({ type: 'edit', data: u })} className="text-ink-muted hover:text-mint hover:underline">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(u.id)} className="text-ink-faint hover:text-rose-400 hover:underline">
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <ProjectUpdateModal
          update={modal.type === 'edit' ? modal.data : null}
          employeeId={employeeId}
          viewer={viewer}
          onClose={() => setModal(null)}
          onSaved={loadData}
        />
      )}
    </Section>
  )
}

function ProjectUpdateModal({ update, employeeId, viewer, onClose, onSaved }) {
  const [date, setDate] = useState(update?.date || todayISO())
  const [title, setTitle] = useState(update?.title || '')
  const [description, setDescription] = useState(update?.description || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      if (update) {
        // Editing only touches the milestone record itself — the key result it
        // already produced on the goal isn't retroactively rewritten.
        await updateRecord('projectUpdates', update.id, { date, title, description })
      } else {
        await addRecord('projectUpdates', {
          employeeId,
          date,
          title,
          description,
          createdByUid: viewer?.uid || '',
          createdByRole: viewer?.role || '',
          createdAt: new Date().toISOString(),
        })

        const existingGoals = await getRecordsForEmployee('goals', employeeId)
        const clientGoal = existingGoals.find((g) => g.objective === CLIENT_DELIVERY_OBJECTIVE)
        const { isNew, data } = applyMilestoneToGoal(clientGoal, { title }, {
          employeeId,
          ownerName: viewer?.name || '',
          createdByUid: viewer?.uid || '',
          createdByRole: viewer?.role || '',
        })
        if (isNew) {
          await addRecord('goals', data)
        } else {
          await updateRecord('goals', clientGoal.id, data)
        }
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save this update.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title={update ? 'Edit Milestone' : 'Add Milestone'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LabeledInput label="Date" type="date" required value={date} onChange={setDate} />
        <LabeledInput
          label="Milestone"
          required
          value={title}
          onChange={setTitle}
          placeholder="e.g. Go-live for Phase 2 client rollout"
        />
        <LabeledTextarea label="Description" value={description} onChange={setDescription} />
        {!update && (
          <p className="text-xs text-ink-faint">
            This will be added as a completed key result on your {CLIENT_DELIVERY_OBJECTIVE} goal.
          </p>
        )}
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <FormActions submitting={submitting} onCancel={onClose} submitLabel={update ? 'Save' : 'Add Milestone'} />
      </form>
    </Modal>
  )
}
