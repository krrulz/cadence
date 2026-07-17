// Date helpers for the PTO calendar. Leave dates are stored as 'YYYY-MM-DD'
// strings; we parse them into local Date objects component-by-component rather
// than via `new Date(str)` (which treats the string as UTC midnight and can
// shift the day backwards in negative-offset timezones).

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Monday-first week — the team is Belgium-based.
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function parseISO(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

export function toISO(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function monthLabel(year, month) {
  return `${MONTH_NAMES[month]} ${year}`
}

// Days from Monday (0) to the given JS weekday (0=Sun..6=Sat).
function mondayIndex(jsDay) {
  return (jsDay + 6) % 7
}

// A 6-row × 7-col grid of Date objects covering the month, padded with the
// trailing days of the previous month and leading days of the next so every
// week is full. 6 rows always, so the grid height doesn't jump between months.
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - mondayIndex(first.getDay()))
  const weeks = []
  const cursor = new Date(start)
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

// Every ISO date string a leave covers, inclusive of both ends.
export function eachDateInRange(fromISO, toISO_) {
  const from = parseISO(fromISO)
  const to = parseISO(toISO_)
  if (!from || !to || to < from) return fromISO ? [fromISO] : []
  const dates = []
  const cursor = new Date(from)
  // Guard against a pathological range blowing up the loop.
  for (let i = 0; i < 400 && cursor <= to; i++) {
    dates.push(toISO(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

// Index leave records by the ISO dates they cover, so a calendar cell can look
// up "who is off on this day" in O(1). Returns { 'YYYY-MM-DD': [record, ...] }.
export function indexLeavesByDate(leaves) {
  const byDate = {}
  for (const leave of leaves) {
    for (const iso of eachDateInRange(leave.dateFrom, leave.dateTo)) {
      ;(byDate[iso] ||= []).push(leave)
    }
  }
  return byDate
}

export function isSameMonth(date, year, month) {
  return date.getFullYear() === year && date.getMonth() === month
}

export function isToday(date) {
  return toISO(date) === toISO(new Date())
}

export function isWeekend(date) {
  const d = date.getDay()
  return d === 0 || d === 6
}
