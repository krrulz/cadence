// Birthday helpers. Birthdays are stored as 'MM-DD' only — the year of birth
// is never collected or stored, so age can't be derived.

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Max day per month (Feb allows 29; a Feb-29 birthday simply only matches in
// leap years — see birthdayState).
export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const MMDD_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

// 'MM-DD' -> 'DD Mon' (e.g. '07-23' -> '23 Jul'). Empty/invalid -> ''.
export function formatBirthday(mmdd) {
  if (!mmdd || !MMDD_RE.test(mmdd)) return ''
  const [m, d] = mmdd.split('-').map(Number)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}

// Returns the value if it's a complete valid 'MM-DD', else '' (used on save so
// a half-picked month/day never persists).
export function normalizeBirthday(value) {
  return value && MMDD_RE.test(value) ? value : ''
}

export function mmddOf(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// The reminder window runs from the day before until the end of the birthday:
// 'today' on the birthday itself, 'tomorrow' on the day before, else null.
// Year wrap (Dec 31 -> Jan 1) is handled by real Date arithmetic.
export function birthdayState(mmdd, today = new Date()) {
  if (!mmdd || !MMDD_RE.test(mmdd)) return null
  if (mmddOf(today) === mmdd) return 'today'
  const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (mmddOf(next) === mmdd) return 'tomorrow'
  return null
}
