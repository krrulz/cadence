// One-line human-readable summaries for each record type, used by the
// cross-tab "Compose Email" selection feature on the admin Employee Detail page.

export function performanceSummaryLine(record) {
  if (record.entryType === 'Achievement') {
    return `[Achievement, ${record.date}] ${record.title}${record.description ? ' — ' + record.description : ''}`
  }
  const rating = record.rating != null ? ` — Rating ${record.rating}/5` : ''
  return `[Review, ${record.date}] ${record.reviewPeriod || ''}${rating}${record.comments ? '. ' + record.comments : ''}`
}

export function grievanceSummaryLine(record) {
  return `[Grievance, ${record.dateRaised}] ${record.category} (${record.status})${record.description ? ' — ' + record.description : ''}`
}

export function recognitionSummaryLine(record) {
  return `[Recognition, ${record.date}] ${record.type} from ${record.givenBy}${record.description ? ' — ' + record.description : ''}`
}

export function feedbackSummaryLine(record) {
  return `[Feedback, ${record.date}] ${record.type} from ${record.givenBy}${record.summary ? ' — ' + record.summary : ''}`
}

export function leaveSummaryLine(record) {
  return `[Leave, ${record.dateFrom} to ${record.dateTo}] ${record.leaveType} (${record.status}, ${record.numDays} day${record.numDays === 1 ? '' : 's'})`
}
