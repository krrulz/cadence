// Working-day leave calculations. Leave is counted in working days: weekends
// and public holidays are excluded. A single-day request can be a half day.

import { parseISO, toISO, isWeekend } from './calendar.js'

// Count working days between two ISO dates inclusive, skipping weekends and any
// date present in `holidaySet` (a Set of 'YYYY-MM-DD' strings).
export function countWorkingDays(fromISO, toISO_, holidaySet = new Set()) {
  const from = parseISO(fromISO)
  const to = parseISO(toISO_)
  if (!from || !to || to < from) return 0
  let count = 0
  const cursor = new Date(from)
  while (cursor <= to) {
    const iso = toISO(cursor)
    if (!isWeekend(cursor) && !holidaySet.has(iso)) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

// Days a leave request consumes. A half day only applies to a single-day
// request and only if that day is itself a working day.
export function computeLeaveDays({ dateFrom, dateTo, halfDay = false }, holidaySet = new Set()) {
  if (!dateFrom || !dateTo) return 0
  const working = countWorkingDays(dateFrom, dateTo, holidaySet)
  if (halfDay && dateFrom === dateTo) return working > 0 ? 0.5 : 0
  return working
}

// Build a Set of holiday ISO dates from the holidays collection docs.
export function holidaySet(holidays) {
  return new Set((holidays || []).map((h) => h.date))
}
