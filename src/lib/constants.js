export const LEAVE_TYPES = ['Casual Leave', 'Sick Leave', 'Earned Annual Leave', 'Comp Off']

export const DEFAULT_LEAVE_ENTITLEMENTS = {
  'Casual Leave': 12,
  'Sick Leave': 10,
  'Earned Annual Leave': 15,
  'Comp Off': 5,
}

// Leave taken before the team started using Cadence. Tracked separately from
// entitlement so the entitlement stays truthful (12 days/year is still 12 even
// if 4 are already gone) and so it can be reset at the start of a new year
// without having to remember each person's original allowance.
export const DEFAULT_LEAVE_OPENING_TAKEN = {
  'Casual Leave': 0,
  'Sick Leave': 0,
  'Earned Annual Leave': 0,
  'Comp Off': 0,
}

export const GRIEVANCE_CATEGORIES = [
  'Workplace Conflict',
  'Compensation',
  'Harassment',
  'Policy',
  'Facilities',
  'Other',
]

export const FEEDBACK_TYPES = ['1:1', 'Peer', '360', 'Skip-level']

export const RECOGNITION_TYPES = ['Spot Award', 'Peer Recognition', 'Milestone', 'Value Award', 'Other']

export const PEER_RECOGNITION_TYPES = ['Spot Award', 'Peer Shoutout', 'Great Teamwork']

export const GRIEVANCE_STATUSES = ['Open', 'In Progress', 'Resolved']

export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected']

export const FEEDBACK_OVERDUE_DAYS = 90
export const LOW_PERFORMANCE_THRESHOLD = 3
export const LOW_LEAVE_BALANCE_THRESHOLD = 2
