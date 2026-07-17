// Column definitions for each exportable section. Each report prepends the
// employee's name and email so a downloaded CSV stands alone. `field` reads
// straight off the record; `value` is for computed/derived columns.

const EMPLOYEE_COLUMNS = [
  { header: 'Employee', value: (r, emp) => emp.name },
  { header: 'Email', value: (r, emp) => emp.email },
]

export const REPORTS = {
  performance: {
    label: 'Performance & Achievements',
    columns: [
      ...EMPLOYEE_COLUMNS,
      { header: 'Type', value: (r) => (r.entryType === 'Achievement' ? 'Achievement' : 'Review') },
      { header: 'Date', field: 'date' },
      { header: 'Title / Period', value: (r) => (r.entryType === 'Achievement' ? r.title : r.reviewPeriod) },
      { header: 'Rating', field: 'rating' },
      { header: 'Reviewer', field: 'reviewer' },
      { header: 'Comments / Description', value: (r) => (r.entryType === 'Achievement' ? r.description : r.comments) },
      { header: 'Goals', field: 'goals' },
    ],
  },
  grievances: {
    label: 'Grievances',
    columns: [
      ...EMPLOYEE_COLUMNS,
      { header: 'Date Raised', field: 'dateRaised' },
      { header: 'Category', field: 'category' },
      { header: 'Description', field: 'description' },
      { header: 'Status', field: 'status' },
      { header: 'Resolution Date', field: 'resolutionDate' },
      { header: 'Resolved By', field: 'resolvedBy' },
    ],
  },
  recognitions: {
    label: 'Recognitions',
    columns: [
      ...EMPLOYEE_COLUMNS,
      { header: 'Date', field: 'date' },
      { header: 'Type', field: 'type' },
      { header: 'Description', field: 'description' },
      { header: 'Given By', field: 'givenBy' },
      { header: 'Source', value: (r) => (r.source === 'peer' ? 'Peer' : 'Admin') },
    ],
  },
  feedback: {
    label: 'Feedback',
    columns: [
      ...EMPLOYEE_COLUMNS,
      { header: 'Date', field: 'date' },
      { header: 'Type', field: 'type' },
      { header: 'Given By', field: 'givenBy' },
      { header: 'Summary', field: 'summary' },
      { header: 'Action Items', field: 'actionItems' },
      { header: 'Follow-up Date', field: 'followUpDate' },
    ],
  },
  leaves: {
    label: 'Leave',
    columns: [
      ...EMPLOYEE_COLUMNS,
      { header: 'Type', field: 'leaveType' },
      { header: 'From', field: 'dateFrom' },
      { header: 'To', field: 'dateTo' },
      { header: 'Days', field: 'numDays' },
      { header: 'Status', field: 'status' },
      { header: 'Approved By', field: 'approvedBy' },
    ],
  },
}

// Build header + row arrays for buildCsv(). `records` is the section's docs;
// `employeesById` maps employeeId -> employee doc for the name/email columns.
export function buildReportRows(section, records, employeesById) {
  const def = REPORTS[section]
  const headers = def.columns.map((c) => c.header)
  const rows = records.map((rec) => {
    const emp = employeesById[rec.employeeId] || { name: 'Unknown', email: '' }
    return def.columns.map((c) => (c.value ? c.value(rec, emp) : rec[c.field]))
  })
  return { headers, rows }
}
