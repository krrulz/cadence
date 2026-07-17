// SLA logic for grievances. A grievance carries a target resolution window
// (explicit `slaDays`, or the default for its priority). We derive a due date
// from the date it was raised and compare it against today to surface an SLA
// state, so overdue open grievances stand out.

import { parseISO, toISO } from './calendar.js'
import { GRIEVANCE_SLA_DAYS } from './constants.js'

const DEFAULT_PRIORITY = 'Medium'
const DUE_SOON_DAYS = 2 // within this many days of the due date → "Due Soon"

function slaDaysFor(grievance) {
  if (Number.isFinite(grievance.slaDays)) return grievance.slaDays
  return GRIEVANCE_SLA_DAYS[grievance.priority] ?? GRIEVANCE_SLA_DAYS[DEFAULT_PRIORITY]
}

// The date the grievance should be resolved by (ISO string), or null if it was
// never dated.
export function grievanceDueDate(grievance) {
  const raised = parseISO(grievance.dateRaised)
  if (!raised) return null
  const due = new Date(raised)
  due.setDate(due.getDate() + slaDaysFor(grievance))
  return toISO(due)
}

// { state, daysLeft, dueDate } where state is one of:
// 'Resolved' | 'Overdue' | 'Due Soon' | 'On Track' | 'No Date'.
// `daysLeft` is whole days from today to the due date (negative = overdue).
export function grievanceSla(grievance, today = new Date()) {
  if (grievance.status === 'Resolved') return { state: 'Resolved', daysLeft: null, dueDate: null }

  const dueISO = grievanceDueDate(grievance)
  if (!dueISO) return { state: 'No Date', daysLeft: null, dueDate: null }

  const due = parseISO(dueISO)
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const daysLeft = Math.round((due - todayMidnight) / (1000 * 60 * 60 * 24))

  let state
  if (daysLeft < 0) state = 'Overdue'
  else if (daysLeft <= DUE_SOON_DAYS) state = 'Due Soon'
  else state = 'On Track'

  return { state, daysLeft, dueDate: dueISO }
}
