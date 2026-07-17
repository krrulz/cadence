import {
  LEAVE_TYPES,
  FEEDBACK_OVERDUE_DAYS,
  LOW_PERFORMANCE_THRESHOLD,
  LOW_LEAVE_BALANCE_THRESHOLD,
} from './constants.js'

export function sortByDateDesc(records, dateField = 'date') {
  return [...records].sort((a, b) => (b[dateField] || '').localeCompare(a[dateField] || ''))
}

export function latestByDate(records, dateField = 'date') {
  if (!records.length) return null
  return sortByDateDesc(records, dateField)[0]
}

// Balance = entitlement − leave taken before Cadence (openingTaken) − approved
// leave logged in Cadence. openingTaken covers mid-year adoption, where people
// have already used days that were never recorded here.
export function computeLeaveBalance(user, leaveRecords) {
  const entitlements = user.leaveEntitlements || {}
  const openingTaken = user.leaveOpeningTaken || {}
  const carryOverMap = user.leaveCarryOver || {}
  const byType = {}
  for (const type of LEAVE_TYPES) {
    const entitlement = entitlements[type] ?? 0
    const carryOver = Number(carryOverMap[type]) || 0
    const takenBefore = Number(openingTaken[type]) || 0
    const takenInApp = leaveRecords
      .filter((l) => l.leaveType === type && l.status === 'Approved')
      .reduce((sum, l) => sum + (Number(l.numDays) || 0), 0)
    const taken = takenBefore + takenInApp
    // Carry-over from last year adds to this year's usable balance.
    byType[type] = { entitlement, carryOver, taken, takenBefore, takenInApp, balance: entitlement + carryOver - taken }
  }
  const total = Object.values(byType).reduce((sum, t) => sum + t.balance, 0)
  return { byType, total }
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity
  const then = new Date(dateStr)
  const diffMs = Date.now() - then.getTime()
  return diffMs / (1000 * 60 * 60 * 24)
}

// Reviews carry a rating and drive the performance-related attention flags;
// achievements are self-logged wins with no rating and don't count as review data.
export function isReview(record) {
  return record.entryType !== 'Achievement'
}

export function computeAttentionFlags({ reviewRecords, grievanceRecords, feedbackRecords, leaveBalanceTotal }) {
  const flags = []

  if (reviewRecords.length === 0) {
    flags.push('No Data')
  } else {
    const latest = latestByDate(reviewRecords, 'date')
    if (Number(latest.rating) < LOW_PERFORMANCE_THRESHOLD) {
      flags.push('Low Performance')
    }
  }

  const hasOpenGrievance = grievanceRecords.some((g) => g.status === 'Open' || g.status === 'In Progress')
  if (hasOpenGrievance) flags.push('Grievance Open')

  const latestFeedback = latestByDate(feedbackRecords, 'date')
  if (!latestFeedback || daysSince(latestFeedback.date) >= FEEDBACK_OVERDUE_DAYS) {
    flags.push('Feedback Overdue')
  }

  if (leaveBalanceTotal < LOW_LEAVE_BALANCE_THRESHOLD) {
    flags.push('Low Leave Balance')
  }

  if (flags.length === 0) flags.push('OK')

  return flags
}

export function buildEmployeeSummary(user, { performance, grievances, recognitions, feedback, leaves }) {
  const performanceRecords = performance.filter((p) => p.employeeId === user.id)
  const grievanceRecords = grievances.filter((g) => g.employeeId === user.id)
  const recognitionRecords = recognitions.filter((r) => r.employeeId === user.id)
  const feedbackRecords = feedback.filter((f) => f.employeeId === user.id)
  const leaveRecords = leaves.filter((l) => l.employeeId === user.id)

  const reviewRecords = performanceRecords.filter(isReview)
  const achievementRecords = performanceRecords.filter((p) => !isReview(p))

  const latestPerformance = latestByDate(reviewRecords, 'date')
  const latestRecognition = latestByDate(recognitionRecords, 'date')
  const latestFeedback = latestByDate(feedbackRecords, 'date')
  const openGrievanceCount = grievanceRecords.filter((g) => g.status === 'Open' || g.status === 'In Progress').length
  const leaveBalance = computeLeaveBalance(user, leaveRecords)

  const flags = computeAttentionFlags({
    reviewRecords,
    grievanceRecords,
    feedbackRecords,
    leaveBalanceTotal: leaveBalance.total,
  })

  return {
    user,
    latestPerformance,
    latestRecognition,
    latestFeedback,
    openGrievanceCount,
    leaveBalance,
    flags,
    performanceRecords,
    reviewRecords,
    achievementRecords,
    grievanceRecords,
    recognitionRecords,
    feedbackRecords,
    leaveRecords,
  }
}
