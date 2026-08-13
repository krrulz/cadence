// Pure helpers for the Timesheet module: auto-splitting logged hours across
// working days, month grouping, and the headline numbers shown per month.

import { parseISO, toISO, isWeekend } from './calendar.js'

export const MAX_DAILY_HOURS = 8

export function yearMonthOf(dateISO) {
  return (dateISO || '').slice(0, 7)
}

// 'YYYY-MM' -> 'August 2026'.
export function monthLabelFromYearMonth(yearMonth) {
  const [y, m] = (yearMonth || '').split('-').map(Number)
  if (!y || !m) return yearMonth || ''
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
}

// Move a 'YYYY-MM' string forward/back by `delta` months.
export function shiftYearMonth(yearMonth, delta) {
  const [y, m] = (yearMonth || '').split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentYearMonth() {
  return yearMonthOf(toISO(new Date()))
}

// Forward-fill `totalHours` across working days starting at `startDateISO`,
// topping each day up to `dailyCap` (accounting for hours the employee already
// has logged that day via `existingHoursByDate`), skipping weekends and any
// day that's already at capacity. Returns [{date, hours}].
export function splitHoursAcrossDays({ startDateISO, totalHours, dailyCap = MAX_DAILY_HOURS, existingHoursByDate = {} }) {
  const start = parseISO(startDateISO)
  if (!start || !(totalHours > 0)) return []
  const days = []
  let remaining = totalHours
  const cursor = new Date(start)
  let guard = 0
  while (remaining > 0.0001 && guard < 400) {
    guard++
    if (!isWeekend(cursor)) {
      const iso = toISO(cursor)
      const already = existingHoursByDate[iso] || 0
      const capacity = dailyCap - already
      if (capacity > 0.0001) {
        const alloc = Math.min(capacity, remaining)
        days.push({ date: iso, hours: Math.round(alloc * 100) / 100 })
        remaining -= alloc
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

// Sum of hours per date across a set of entries.
export function hoursByDate(entries) {
  const map = {}
  for (const e of entries) map[e.date] = (map[e.date] || 0) + (Number(e.hours) || 0)
  return map
}

export function entriesForMonth(entries, yearMonth) {
  return entries.filter((e) => yearMonthOf(e.date) === yearMonth)
}

// True when adding `hours` on `dateISO` would push that day's logged total
// over the daily cap, given the employee's other entries for that date.
export function wouldExceedDailyCap(entries, dateISO, hours, dailyCap = MAX_DAILY_HOURS, excludeEntryId = null) {
  const existing = entries
    .filter((e) => e.date === dateISO && e.id !== excludeEntryId)
    .reduce((s, e) => s + (Number(e.hours) || 0), 0)
  return existing + (Number(hours) || 0) > dailyCap + 0.0001
}

// Headline numbers for a month's entries.
export function monthSummary(entries) {
  const totalHours = round2(entries.reduce((s, e) => s + (Number(e.hours) || 0), 0))
  const weekendHours = round2(entries.filter((e) => e.weekend).reduce((s, e) => s + (Number(e.hours) || 0), 0))
  const overtimeHours = round2(entries.filter((e) => e.overtime).reduce((s, e) => s + (Number(e.hours) || 0), 0))
  const daysLogged = new Set(entries.map((e) => e.date)).size
  return { totalHours, weekendHours, overtimeHours, daysLogged, entryCount: entries.length }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// One summary row per employee for a given month — for the manager Timesheets
// page. `periods` is keyed by `${employeeId}_${yearMonth}`.
export function employeeMonthRows(employees, entries, periods, yearMonth) {
  const byEmp = {}
  for (const e of entries) {
    if (yearMonthOf(e.date) !== yearMonth) continue
    ;(byEmp[e.employeeId] ||= []).push(e)
  }
  return employees.map((emp) => {
    const empEntries = byEmp[emp.id] || []
    const summary = monthSummary(empEntries)
    const period = periods[`${emp.id}_${yearMonth}`]
    return { employee: emp, entries: empEntries, ...summary, status: period?.status === 'frozen' ? 'Frozen' : 'Open' }
  })
}
