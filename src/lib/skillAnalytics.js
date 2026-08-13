// Pure aggregation functions for the Team Skills dashboard, over raw `skills`
// docs (+ the employee list they belong to) so they're unit-testable without
// Firestore. Mirrors the pattern in analytics.js / resourceRisk.js.

import { SKILL_LEVELS, SKILL_CATEGORIES } from './constants.js'

const LEVEL_LABEL = Object.fromEntries(SKILL_LEVELS.map((l) => [l.n, l.label]))

// Headline numbers for the stat-card row.
export function skillsSummary(employees, skills) {
  const peopleWithSkills = new Set(skills.map((s) => s.employeeId)).size
  const distinctSkills = new Set(skills.map((s) => s.name)).size
  const avgPerPerson = employees.length ? skills.length / employees.length : 0
  return {
    teamSize: employees.length,
    peopleWithSkills,
    distinctSkills,
    totalRatings: skills.length,
    avgPerPerson: avgPerPerson.toFixed(1),
  }
}

// Count of ratings per level 1-5.
export function levelDistribution(skills) {
  const counts = SKILL_LEVELS.map((l) => ({ label: l.label, value: 0 }))
  for (const s of skills) {
    const lvl = Number(s.level)
    if (Number.isInteger(lvl) && lvl >= 1 && lvl <= 5) counts[lvl - 1].value++
  }
  return counts
}

// Distinct people with at least one rating per category, in canonical order.
export function categoryCoverage(skills) {
  const byCategory = new Map(SKILL_CATEGORIES.map((c) => [c, new Set()]))
  for (const s of skills) {
    if (byCategory.has(s.category) && s.employeeId) byCategory.get(s.category).add(s.employeeId)
  }
  return SKILL_CATEGORIES.map((c) => ({ label: c, value: byCategory.get(c).size }))
}

// Top N skills by distinct holder count, most-held first.
export function topSkillsByHolders(skills, limit = 8) {
  const byName = new Map()
  for (const s of skills) {
    if (!s.name || !s.employeeId) continue
    if (!byName.has(s.name)) byName.set(s.name, new Set())
    byName.get(s.name).add(s.employeeId)
  }
  return [...byName.entries()]
    .map(([label, ids]) => ({ label, value: ids.size }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit)
}

// How many of `employees` have at least one skill submitted via the public
// Skill Survey (updatedByRole === 'self-survey') vs not yet.
export function surveyCompletion(employees, skills) {
  const completedIds = new Set(skills.filter((s) => s.updatedByRole === 'self-survey').map((s) => s.employeeId))
  const completed = employees.filter((e) => completedIds.has(e.id)).length
  return [
    { label: 'Completed', value: completed },
    { label: 'Not yet', value: Math.max(employees.length - completed, 0) },
  ]
}

// Per-skill holder list + gap flags, sorted biggest-gap-first (fewest
// holders, then lowest max level reached).
export function coverageBySkill(skills, empById) {
  const map = new Map()
  for (const s of skills) {
    if (!s.name) continue
    if (!map.has(s.name)) map.set(s.name, [])
    map.get(s.name).push({ empId: s.employeeId, name: empById[s.employeeId]?.name || '—', level: s.level || 0 })
  }
  const rows = [...map.entries()].map(([name, holders]) => {
    const maxLevel = Math.max(...holders.map((h) => h.level))
    const advanced = holders.filter((h) => h.level >= 4).length
    const flags = []
    if (holders.length === 1) flags.push('Single point')
    if (advanced === 0) flags.push('No expert')
    return {
      name,
      holders: holders.sort((a, b) => b.level - a.level),
      count: holders.length,
      maxLevel,
      maxLevelLabel: LEVEL_LABEL[maxLevel] || '—',
      advanced,
      flags,
    }
  })
  return rows.sort((a, b) => a.count - b.count || a.maxLevel - b.maxLevel || a.name.localeCompare(b.name))
}
