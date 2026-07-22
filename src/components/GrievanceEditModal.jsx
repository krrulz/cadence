import { useState } from 'react'
import Modal from './Modal.jsx'
import { LabeledTextarea, FormActions } from './FormFields.jsx'
import { updateRecord } from '../lib/firestoreHelpers.js'
import { GRIEVANCE_CATEGORIES } from '../lib/constants.js'

// Edit the category/description of a grievance. Allowed for the owner (their
// own) and admin — firestore.rules restricts the owner to exactly these two
// fields, so status/priority/assignee stay under admin control.
export default function GrievanceEditModal({ record, onClose, onSaved }) {
  const [category, setCategory] = useState(record.category || GRIEVANCE_CATEGORIES[0])
  const [description, setDescription] = useState(record.description || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await updateRecord('grievances', record.id, { category, description })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save changes.')
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Edit Grievance" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input mt-1">
            {GRIEVANCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <LabeledTextarea label="Description" required value={description} onChange={setDescription} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <FormActions submitting={submitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}
