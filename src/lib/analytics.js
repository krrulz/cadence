// Team-wide aggregations for the Analytics dashboard. Pure functions over the
// raw record collections so they can be unit-tested without Firestore.

import { LEAVE_TYPES, GRIEVANCE_STATUSES } from './constants.js'
import { isReview } from './aggregate.js'
import { grievanceSla } from './grievance.js'
import { parseISO } from './calendar.js'

// Count of review ratings 1–5 across the whole team (achievements excluded).
export function ratingDistribution(performance) {
  const counts = [1, 2, 3, 4, 5].map((r) => ({ label: String(r), value: 0 }))
  for (const p of performance) {
    if (!isReview(p)) continue
    const r = Number(p.rating)
    if (r >= 1 && r <= 5) counts[r - 1].value++
  }
  return counts
}

// Headcount per department, largest first.
export function headcountByDepartment(employees) {
  const map = new Map()
  for (const e of employees) {
    const dept = e.department?.trim() || 'Unassigned'
    map.set(dept, (map.get(dept) || 0) + 1)
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

// Grievances grouped by status, in the canonical status order.
export function grievanceStatusCounts(grievances) {
  return GRIEVANCE_STATUSES.map((status) => ({
    label: status,
    value: grievances.filter((g) => g.status === status).length,
  }))
}

// How many still-open grievances have blown their SLA.
export function grievanceOverdueCount(grievances, today = new Date()) {
  return grievances.filter((g) => grievanceSla(g, today).state === 'Overdue').length
}

// Approved leave days taken per type across the team, vs total entitlement.
export function leaveByType(employees, leaves) {
  return LEAVE_TYPES.map((type) => {
    const entitled = employees.reduce((sum, e) => sum + (Number(e.leaveEntitlements?.[type]) || 0), 0)
    const openingTaken = employees.reduce((sum, e) => sum + (Number(e.leaveOpeningTaken?.[type]) || 0), 0)
    const inApp = leaves
      .filter((l) => l.leaveType === type && l.status === 'Approved')
      .reduce((sum, l) => sum + (Number(l.numDays) || 0), 0)
    return { label: type, taken: openingTaken + inApp, entitled }
  })
}

// Recognitions per calendar month for the last `months` months (oldest first).
export function recognitionsByMonth(recognitions, months = 6, today = new Date()) {
  const buckets = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en', { month: 'short' }),
      value: 0,
    })
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]))
  for (const r of recognitions) {
    const d = parseISO(r.date)
    if (!d) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (byKey[key]) byKey[key].value++
  }
  return buckets.map(({ label, value }) => ({ label, value }))
}

// Headline numbers for the stat cards.
export function analyticsSummary({ employees, performance, grievances }) {
  const reviews = performance.filter(isReview)
  const avgRating = reviews.length
    ? (reviews.reduce((s, p) => s + (Number(p.rating) || 0), 0) / reviews.length).toFixed(1)
    : '—'
  const openGrievances = grievances.filter((g) => g.status !== 'Resolved').length
  return {
    teamSize: employees.length,
    avgRating,
    openGrievances,
    overdueGrievances: grievanceOverdueCount(grievances),
  }
}
