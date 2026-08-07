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

// Unused leave carried over from the previous year, added to this year's usable
// balance. Tracked separately so it can be reset independently at year start.
export const DEFAULT_LEAVE_CARRY_OVER = {
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

export const GRIEVANCE_PRIORITIES = ['Low', 'Medium', 'High']

// Target time-to-resolution (calendar days from the date raised) per priority.
// Used to derive an SLA state (On Track / Due Soon / Overdue) for open grievances.
export const GRIEVANCE_SLA_DAYS = { Low: 30, Medium: 14, High: 7 }

export const GOAL_STATUSES = ['Not Started', 'In Progress', 'At Risk', 'Completed']

export const SKILL_CATEGORIES = ['Professional Skills', 'Tools/Technologies', 'Domain Knowledge', 'Soft Skill']

// 1–5 expertise scale used by the skill matrix.
export const SKILL_LEVELS = [
  { n: 1, label: 'Novice' },
  { n: 2, label: 'Beginner' },
  { n: 3, label: 'Intermediate' },
  { n: 4, label: 'Advanced' },
  { n: 5, label: 'Expert' },
]

// Seeded topic list shown on the public Skill Survey (src/pages/SkillSurvey.jsx)
// so every expected topic is captured consistently. Employees can also add
// their own items beyond this list, per category.
export const SKILL_CATALOG = {
  'Professional Skills': [
    'Backend Development',
    'Front End Development',
    'Mainframe Development',
    'Techno-Functional Analysis',
    'Business Analysis',
    'Release Engineering',
    'Ops Engineering',
    'Functional Testing',
    'Mainframe Testing',
    'API Testing',
    'Test Automation',
    'Performance Testing',
    'Scrum Master',
    'Product Owner',
  ],
  'Tools/Technologies': [
    'Ruby',
    'BDD',
    'Selenium',
    'Java',
    'Cypress',
    'Octane',
    'Mainframe',
    'Javascript',
    'Perfecto',
    'Loadrunner',
    'Neoload',
    'Jmeter',
    'Postman',
    'SoapUI',
    'WSO Greg',
    'Jenkins',
    'Groovy',
    'CDD',
    'Shell Scripting',
    'Ansible',
    'Terraform',
    'Docker',
  ],
  'Domain Knowledge': ['Payments', 'Accounts', 'Corporate Banking', 'Private Banking', 'KYC', 'Party (KL)', 'KR', 'CRM'],
  'Soft Skill': [
    'Communication',
    'Problem Solving',
    'Teamwork',
    'Time Management',
    'Adaptability',
    'Leadership',
    'Technical Skills',
    'Project Management',
    'Customer Service',
  ],
}

export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected']

export const FEEDBACK_OVERDUE_DAYS = 90
export const LOW_PERFORMANCE_THRESHOLD = 3
export const LOW_LEAVE_BALANCE_THRESHOLD = 2
