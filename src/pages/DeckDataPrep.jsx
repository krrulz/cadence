import { useCallback, useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Section from '../components/Section.jsx'
import Modal from '../components/Modal.jsx'
import { LabeledInput, LabeledTextarea, FormActions } from '../components/FormFields.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  getAllUsers,
  getAllRecords,
  getRecordsForEmployee,
  addRecord,
  updateRecord,
  deleteRecord,
} from '../lib/firestoreHelpers.js'
import { extractPptxResourceUpdates } from '../lib/pptxText.js'
import { bestEmployeeMatch } from '../lib/nameMatch.js'
import { applyMilestoneToGoal, CLIENT_DELIVERY_OBJECTIVE } from '../lib/goalLinks.js'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthLabel() {
  return new Date().toLocaleString('en', { month: 'long', year: 'numeric' })
}

// Admin tool that prepares the data behind the monthly Tribe Customers
// SteerCo deck: (1) upload a resource-update PPTX, extract each person's
// milestones (deterministically, from the deck's own name/bullet table
// layout — see src/lib/pptxText.js), review/correct them, and save as real
// Project Status Update records (which also feed each employee's Client
// Delivery goal, same as the self-service flow) — this is what the
// eventual "Squad Milestones" slide will be generated from; (2) maintain
// the Action Plan list by hand, since it doesn't come from the PPT. PPTX
// *generation* (the actual "Generate & Download" button) is a follow-up
// phase.
export default function DeckDataPrep() {
  return (
    <Layout>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Deck Data Prep</h1>
        <p className="text-sm text-ink-muted">
          Prepare the monthly Tribe Customers SteerCo deck data — extract resource updates from a PPT and maintain the
          action plan. Deck generation is coming in a later step.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <UploadExtractSection />
        <ActionPlanSection />
      </div>
    </Layout>
  )
}

// --- Upload & extract -------------------------------------------------

function UploadExtractSection() {
  const { user, profile } = useAuth()
  const [employees, setEmployees] = useState([])
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [fileName, setFileName] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState(null) // null = nothing extracted yet
  const [month, setMonth] = useState(currentMonthLabel())
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    getAllUsers().then((users) => {
      setEmployees(users.filter((u) => u.role === 'employee'))
      setLoadingEmployees(false)
    })
  }, [])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError('')
    setSavedMessage('')
    setGroups(null)
    setExtracting(true)
    try {
      const resources = await extractPptxResourceUpdates(file)
      if (resources.length === 0) throw new Error('No resource tables were found in that file.')

      const built = resources.map((r, i) => {
        const match = bestEmployeeMatch(r.name, employees)
        return {
          tempId: `g${i}`,
          extractedName: r.name,
          squad: r.squad,
          matchedEmployeeId: match?.employee.id || '',
          items: r.items.map((it, j) => ({ tempId: `g${i}-${j}`, label: it.label, description: it.description })),
        }
      })
      setGroups(built)
    } catch (err) {
      setError(err.message || 'Could not extract data from that file.')
    } finally {
      setExtracting(false)
      e.target.value = ''
    }
  }

  function updateGroup(tempId, patch) {
    setGroups((prev) => prev.map((g) => (g.tempId === tempId ? { ...g, ...patch } : g)))
  }
  function removeGroup(tempId) {
    setGroups((prev) => prev.filter((g) => g.tempId !== tempId))
  }
  function updateItem(groupId, itemId, patch) {
    setGroups((prev) =>
      prev.map((g) => (g.tempId !== groupId ? g : { ...g, items: g.items.map((it) => (it.tempId === itemId ? { ...it, ...patch } : it)) })),
    )
  }
  function removeItem(groupId, itemId) {
    setGroups((prev) => prev.map((g) => (g.tempId !== groupId ? g : { ...g, items: g.items.filter((it) => it.tempId !== itemId) })))
  }
  function addItem(groupId) {
    setGroups((prev) =>
      prev.map((g) =>
        g.tempId !== groupId ? g : { ...g, items: [...g.items, { tempId: `${groupId}-${Date.now()}`, label: '', description: '' }] },
      ),
    )
  }

  const readyGroups = useMemo(
    () => (groups || []).filter((g) => g.matchedEmployeeId && g.items.some((it) => it.label.trim() || it.description.trim())),
    [groups],
  )

  async function handleSaveAll() {
    setSaving(true)
    setError('')
    try {
      const importBatchId = `import-${Date.now()}`
      let savedCount = 0
      for (const group of readyGroups) {
        const employee = employees.find((e) => e.id === group.matchedEmployeeId)
        if (!employee) continue

        // Fetch the employee's Client Delivery goal ONCE, then keep it
        // updated locally across every item so each write sees the
        // previous item's key result rather than racing a stale read.
        const existingGoals = await getRecordsForEmployee('goals', employee.id)
        let clientGoal = existingGoals.find((g) => g.objective === CLIENT_DELIVERY_OBJECTIVE) || null

        for (const item of group.items) {
          const title = item.label.trim()
          const description = item.description.trim()
          if (!title && !description) continue

          await addRecord('projectUpdates', {
            employeeId: employee.id,
            date: todayISO(),
            title: title || description.slice(0, 60),
            description,
            createdByUid: user.uid,
            createdByRole: 'admin',
            squadOwnerName: employee.name,
            month,
            importBatchId,
            createdAt: new Date().toISOString(),
          })
          savedCount++

          const { isNew, data } = applyMilestoneToGoal(clientGoal, { title: title || description }, {
            employeeId: employee.id,
            ownerName: profile?.name || '',
            createdByUid: user.uid,
            createdByRole: 'admin',
          })
          if (isNew) {
            const ref = await addRecord('goals', data)
            clientGoal = { id: ref.id, ...data }
          } else {
            await updateRecord('goals', clientGoal.id, data)
            clientGoal = { ...clientGoal, ...data }
          }
        }
      }
      setSavedMessage(`Saved ${savedCount} update${savedCount === 1 ? '' : 's'} across ${readyGroups.length} resource${readyGroups.length === 1 ? '' : 's'}.`)
      setGroups(null)
      setFileName('')
    } catch (err) {
      setError(err.message || 'Could not save these updates.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section title="Upload monthly resource-update PPT">
      <p className="mb-3 -mt-1 text-sm text-ink-muted">
        Upload the deck each resource filled in this month. I'll read each person's name and updates straight from
        the deck's own tables, then you can review and correct everything below before it's saved as real Project
        Status Updates (which also feed each employee's Client Delivery goal, same as when they log one themselves).
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="font-medium text-ink">Meeting month</span>
          <input value={month} onChange={(e) => setMonth(e.target.value)} className="input mt-1" placeholder="e.g. September 2026" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Resource-update PPTX</span>
          <input
            type="file"
            accept=".pptx"
            onChange={handleFile}
            disabled={extracting || loadingEmployees}
            className="input mt-1"
          />
        </label>
        {fileName && <span className="text-xs text-ink-faint">{fileName}</span>}
      </div>

      {extracting && <p className="mt-3 text-sm text-ink-muted">Reading and matching resources…</p>}
      {error && <p className="mt-3 whitespace-pre-wrap text-sm text-rose-400">{error}</p>}
      {savedMessage && <p className="mt-3 text-sm text-mint">✓ {savedMessage}</p>}

      {groups && (
        <div className="mt-4 space-y-4">
          {groups.length === 0 ? (
            <p className="text-sm text-ink-faint">No resources were detected in that file.</p>
          ) : (
            groups.map((g) => (
              <div key={g.tempId} className="rounded-lg border border-surface-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ink-faint">Extracted as &ldquo;{g.extractedName}&rdquo;{g.squad ? ` (${g.squad})` : ''} →</span>
                    <select
                      value={g.matchedEmployeeId}
                      onChange={(e) => updateGroup(g.tempId, { matchedEmployeeId: e.target.value })}
                      className={`input w-auto ${!g.matchedEmployeeId ? 'ring-1 ring-inset ring-amber-500/50' : ''}`}
                    >
                      <option value="">Unmatched — pick an employee…</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={() => removeGroup(g.tempId)} className="text-xs text-ink-faint hover:text-rose-400 hover:underline">
                    Remove resource
                  </button>
                </div>

                <ul className="mt-3 space-y-2">
                  {g.items.map((it) => (
                    <li key={it.tempId} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-start">
                      <input
                        value={it.label}
                        onChange={(e) => updateItem(g.tempId, it.tempId, { label: e.target.value })}
                        placeholder="Label"
                        className="input text-sm"
                      />
                      <textarea
                        value={it.description}
                        onChange={(e) => updateItem(g.tempId, it.tempId, { description: e.target.value })}
                        placeholder="Description"
                        rows={2}
                        className="input text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(g.tempId, it.tempId)}
                        className="justify-self-start text-ink-faint hover:text-rose-400 sm:justify-self-center"
                        aria-label="Remove item"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => addItem(g.tempId)} className="mt-2 text-xs text-mint hover:underline">
                  + Add item
                </button>
              </div>
            ))
          )}

          {groups.length > 0 && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleSaveAll} disabled={saving || readyGroups.length === 0} className="btn-primary text-sm">
                {saving ? 'Saving…' : `Save ${readyGroups.length} resource${readyGroups.length === 1 ? '' : 's'} to Project Updates`}
              </button>
              {groups.some((g) => !g.matchedEmployeeId) && (
                <span className="text-xs text-amber-300">Some resources are unmatched and won't be saved until you pick an employee.</span>
              )}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

// --- Action Plan ---------------------------------------------------------

function ActionPlanSection() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | {type:'add'} | {type:'edit', data}

  const loadData = useCallback(async () => {
    setLoading(true)
    const records = await getAllRecords('actionPlanItems')
    setItems(records.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')))
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function handleDelete(item) {
    if (!window.confirm('Delete this action plan item?')) return
    await deleteRecord('actionPlanItems', item.id)
    loadData()
  }

  return (
    <Section title="Action Plan" onAdd={() => setModal({ type: 'add' })} addLabel="+ Add Item">
      {loading ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-faint">No action plan items yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Focus Area</th>
                <th className="py-2 pr-4">Resolution / Mitigation</th>
                <th className="py-2 pr-4">Owner</th>
                <th className="py-2 pr-4">Deadline / Status</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-white/5">
                  <td className="max-w-xs py-2 pr-4 text-ink-muted">{it.description}</td>
                  <td className="py-2 pr-4 text-ink-muted">{it.focusArea}</td>
                  <td className="max-w-xs py-2 pr-4 text-ink-muted">{it.resolution}</td>
                  <td className="py-2 pr-4 text-ink-muted">{it.owner}</td>
                  <td className="py-2 pr-4 text-ink-muted">{it.deadlineStatus}</td>
                  <td className="whitespace-nowrap py-2 pr-4">
                    <span className="flex gap-3">
                      <button type="button" onClick={() => setModal({ type: 'edit', data: it })} className="text-xs text-ink-muted hover:text-mint hover:underline">
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(it)} className="text-xs text-ink-faint hover:text-rose-400 hover:underline">
                        Delete
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ActionPlanModal item={modal.type === 'edit' ? modal.data : null} onClose={() => setModal(null)} onSaved={loadData} />
      )}
    </Section>
  )
}

function ActionPlanModal({ item, onClose, onSaved }) {
  const [description, setDescription] = useState(item?.description || '')
  const [focusArea, setFocusArea] = useState(item?.focusArea || '')
  const [resolution, setResolution] = useState(item?.resolution || '')
  const [owner, setOwner] = useState(item?.owner || '')
  const [deadlineStatus, setDeadlineStatus] = useState(item?.deadlineStatus || '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    const data = { description, focusArea, resolution, owner, deadlineStatus }
    if (item) {
      await updateRecord('actionPlanItems', item.id, data)
    } else {
      await addRecord('actionPlanItems', { ...data, createdAt: new Date().toISOString() })
    }
    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title={item ? 'Edit Action Plan Item' : 'Add Action Plan Item'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <LabeledTextarea label="Description" required value={description} onChange={setDescription} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="Focus Area" value={focusArea} onChange={setFocusArea} placeholder="e.g. Delivery Management" />
          <LabeledInput label="Owner" value={owner} onChange={setOwner} placeholder="e.g. Expleo" />
        </div>
        <LabeledTextarea label="Resolution / Mitigation" value={resolution} onChange={setResolution} />
        <LabeledInput label="Deadline / Status" value={deadlineStatus} onChange={setDeadlineStatus} placeholder="e.g. In Progress" />
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}
