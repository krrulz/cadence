import { useMemo, useState } from 'react'
import Modal from './Modal.jsx'
import { updateUserProfile } from '../lib/firestoreHelpers.js'
import {
  LEAVE_TYPES,
  DEFAULT_LEAVE_ENTITLEMENTS,
  DEFAULT_LEAVE_OPENING_TAKEN,
  DEFAULT_LEAVE_CARRY_OVER,
} from '../lib/constants.js'
import { computeLeaveBalance } from '../lib/aggregate.js'

export default function EditLeaveModal({ employee, leaveRecords, onClose, onSaved }) {
  const [entitlements, setEntitlements] = useState(() => ({
    ...DEFAULT_LEAVE_ENTITLEMENTS,
    ...(employee.leaveEntitlements || {}),
  }))
  const [openingTaken, setOpeningTaken] = useState(() => ({
    ...DEFAULT_LEAVE_OPENING_TAKEN,
    ...(employee.leaveOpeningTaken || {}),
  }))
  const [carryOver, setCarryOver] = useState(() => ({
    ...DEFAULT_LEAVE_CARRY_OVER,
    ...(employee.leaveCarryOver || {}),
  }))
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Live preview of the resulting balance, using the same math the app uses.
  const preview = useMemo(
    () =>
      computeLeaveBalance(
        { leaveEntitlements: entitlements, leaveOpeningTaken: openingTaken, leaveCarryOver: carryOver },
        leaveRecords,
      ),
    [entitlements, openingTaken, carryOver, leaveRecords],
  )

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await updateUserProfile(employee.id, {
        leaveEntitlements: entitlements,
        leaveOpeningTaken: openingTaken,
        leaveCarryOver: carryOver,
      })
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title={`Leave entitlements — ${employee.name}`} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
          <strong>Entitlement</strong> is the full yearly allowance. <strong>Already taken</strong> is leave used before
          this was tracked in Cadence — set it when adopting mid-year, then reset it to 0 at the start of a new year.
          <strong> Carry-over</strong> is unused leave brought in from last year. Leave approved inside Cadence is
          counted automatically and isn't editable here.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Leave type</th>
                <th className="py-2 pr-4">Entitlement</th>
                <th className="py-2 pr-4">Carry-over</th>
                <th className="py-2 pr-4">Already taken</th>
                <th className="py-2 pr-4">Logged in Cadence</th>
                <th className="py-2 pr-4">Balance</th>
              </tr>
            </thead>
            <tbody>
              {LEAVE_TYPES.map((type) => {
                const row = preview.byType[type]
                return (
                  <tr key={type} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-700">{type}</td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min={0}
                        required
                        value={entitlements[type] ?? 0}
                        onChange={(e) => setEntitlements((s) => ({ ...s, [type]: Number(e.target.value) }))}
                        className="input w-24"
                        aria-label={`${type} entitlement`}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min={0}
                        required
                        value={carryOver[type] ?? 0}
                        onChange={(e) => setCarryOver((s) => ({ ...s, [type]: Number(e.target.value) }))}
                        className="input w-24"
                        aria-label={`${type} carry-over`}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min={0}
                        required
                        value={openingTaken[type] ?? 0}
                        onChange={(e) => setOpeningTaken((s) => ({ ...s, [type]: Number(e.target.value) }))}
                        className="input w-24"
                        aria-label={`${type} already taken`}
                      />
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{row.takenInApp}</td>
                    <td className={`py-2 pr-4 font-semibold ${row.balance < 0 ? 'text-red-600' : 'text-brand'}`}>
                      {row.balance}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {preview.total < 0 && (
          <p className="text-sm text-amber-700">
            Some balances are negative — that means more leave is recorded as taken than the entitlement allows. Check
            the numbers unless that's intentional.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
