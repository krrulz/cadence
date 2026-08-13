import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Avatar from '../components/Avatar.jsx'
import Modal from '../components/Modal.jsx'
import { BarChart, DonutChart } from '../components/Charts.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getAllUsers, getAllRecords } from '../lib/firestoreHelpers.js'
import { isManagedBy } from '../lib/manager.js'
import { headcountByDepartment } from '../lib/analytics.js'
import { buildCsv, downloadTextFile } from '../lib/csv.js'
import { SKILL_LEVELS } from '../lib/constants.js'
import {
  skillsSummary,
  levelDistribution,
  categoryCoverage,
  topSkillsByHolders,
  surveyCompletion,
  coverageBySkill,
} from '../lib/skillAnalytics.js'

const LEVEL_LABEL = Object.fromEntries(SKILL_LEVELS.map((l) => [l.n, l.label]))

const SOURCE_LABEL = {
  'self-survey': 'Skill Survey',
  'bulk-import': 'Bulk Import',
  admin: 'Admin edit',
  employee: 'Self edit',
}

function StatCard({ label, value }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}

// Typeahead + checklist multi-select for tech-stack filtering. Deliberately a
// simple always-open list (rather than a popover) to keep this dependency-free
// and consistent with the rest of the app's plain-input styling.
function TechStackFilter({ options, selected, onChange }) {
  const [query, setQuery] = useState('')
  const filtered = query ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase())) : options

  function toggle(name) {
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name])
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-mint/10 px-2 py-0.5 text-[11px] text-mint ring-1 ring-inset ring-mint/25"
            >
              {s}
              <button type="button" onClick={() => toggle(s)} aria-label={`Remove ${s}`} className="hover:text-white">
                ✕
              </button>
            </span>
          ))}
          <button type="button" onClick={() => onChange([])} className="text-[11px] text-ink-faint hover:text-ink">
            Clear all
          </button>
        </div>
      )}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tech stack…"
        className="input text-sm"
      />
      <div className="mt-1.5 max-h-32 overflow-y-auto rounded-lg border border-surface-border p-1.5">
        {filtered.length === 0 ? (
          <p className="p-1 text-xs text-ink-faint">No matches.</p>
        ) : (
          filtered.map((name) => (
            <label key={name} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-white/5">
              <input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)} />
              <span className="text-ink-muted">{name}</span>
            </label>
          ))
        )}
      </div>
    </div>
  )
}

function ExportModal({ allEmployees, allSkills, filteredEmployees, filteredSkills, filterSummary, onClose }) {
  const [exportScope, setExportScope] = useState('filtered') // 'filtered' | 'all'

  function handleDownload() {
    const employees = exportScope === 'all' ? allEmployees : filteredEmployees
    const skills = exportScope === 'all' ? allSkills : filteredSkills
    const empById = Object.fromEntries(employees.map((e) => [e.id, e]))
    const headers = ['Employee Name', 'Employee UUID', 'Department', 'Category', 'Skill', 'Level', 'Level Label', 'Source', 'Last Updated']
    const rows = skills
      .filter((s) => empById[s.employeeId])
      .map((s) => {
        const emp = empById[s.employeeId]
        return [
          emp.name,
          emp.id,
          emp.department || 'Unassigned',
          s.category || '',
          s.name,
          s.level || '',
          LEVEL_LABEL[s.level] || '',
          SOURCE_LABEL[s.updatedByRole] || s.updatedByRole || '—',
          (s.updatedAt || '').slice(0, 10),
        ]
      })
    const csv = buildCsv(headers, rows)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTextFile(`team-skills-${exportScope}-${stamp}.csv`, csv)
  }

  const previewCount = exportScope === 'all' ? allSkills.length : filteredSkills.length

  return (
    <Modal title="Export skill data" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="flex items-start gap-2 rounded-lg border border-surface-border p-2.5 text-sm">
            <input
              type="radio"
              name="export-scope"
              checked={exportScope === 'filtered'}
              onChange={() => setExportScope('filtered')}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-ink">Current view (filtered)</span>
              <span className="block text-xs text-ink-faint">{filterSummary}</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-surface-border p-2.5 text-sm">
            <input
              type="radio"
              name="export-scope"
              checked={exportScope === 'all'}
              onChange={() => setExportScope('all')}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-ink">All skills data</span>
              <span className="block text-xs text-ink-faint">Every employee, ignoring filters and scope.</span>
            </span>
          </label>
        </div>

        <p className="text-sm text-ink-muted">{previewCount} skill rating{previewCount === 1 ? '' : 's'} to export.</p>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleDownload} disabled={previewCount === 0} className="btn-primary">
            Download CSV
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function TeamSkills() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [skills, setSkills] = useState([])
  const [scope, setScope] = useState('team') // 'team' | 'all'
  // Multiple skill+level criteria, ANDed together — the existing "Find talent" search.
  const [criteria, setCriteria] = useState([{ id: 1, skill: '', minLevel: 3 }])
  // New filter bar, independent of Find talent, drives the stat cards / charts / coverage / export.
  const [filterDept, setFilterDept] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterTechStack, setFilterTechStack] = useState([])
  const [showExport, setShowExport] = useState(false)

  const updateCriterion = (id, patch) => setCriteria((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const addCriterion = () => setCriteria((cs) => [...cs, { id: Date.now(), skill: '', minLevel: 3 }])
  const removeCriterion = (id) => setCriteria((cs) => (cs.length > 1 ? cs.filter((c) => c.id !== id) : cs))

  const admin = { uid: user.uid, name: profile?.name }

  const loadData = useCallback(async () => {
    setLoading(true)
    const [u, s] = await Promise.all([getAllUsers(), getAllRecords('skills')])
    setUsers(u)
    setSkills(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const allEmployees = useMemo(() => users.filter((u) => u.role === 'employee'), [users])

  // Employees in scope (team/all), and their skills — feeds Find talent + the filter bar's options.
  const { empById, scopedEmployees, scopedSkills } = useMemo(() => {
    const employees = allEmployees.filter((u) => scope === 'all' || isManagedBy(u, admin))
    const byId = Object.fromEntries(employees.map((e) => [e.id, e]))
    return { empById: byId, scopedEmployees: employees, scopedSkills: skills.filter((sk) => byId[sk.employeeId]) }
  }, [allEmployees, skills, scope, admin.uid, admin.name])

  const skillNames = useMemo(
    () => [...new Set(scopedSkills.map((s) => s.name))].sort((a, b) => a.localeCompare(b)),
    [scopedSkills],
  )

  // employeeId -> { skillName: highest level }.
  const skillsByEmp = useMemo(() => {
    const m = {}
    for (const s of scopedSkills) {
      m[s.employeeId] = m[s.employeeId] || {}
      m[s.employeeId][s.name] = Math.max(m[s.employeeId][s.name] || 0, s.level || 0)
    }
    return m
  }, [scopedSkills])

  // Finder — people who meet ALL active criteria (skill at >= its min level). Unchanged behaviour.
  const matches = useMemo(() => {
    const active = criteria.filter((c) => c.skill)
    if (!active.length) return []
    return Object.values(empById)
      .filter((emp) => active.every((c) => (skillsByEmp[emp.id]?.[c.skill] || 0) >= c.minLevel))
      .map((emp) => ({
        emp,
        levels: active.map((c) => ({ skill: c.skill, level: skillsByEmp[emp.id][c.skill] })),
      }))
      .sort(
        (a, b) =>
          b.levels.reduce((s, x) => s + x.level, 0) - a.levels.reduce((s, x) => s + x.level, 0) ||
          a.emp.name.localeCompare(b.emp.name),
      )
  }, [empById, skillsByEmp, criteria])

  const activeCriteria = criteria.filter((c) => c.skill)

  // Departments available within the current scope.
  const deptOptions = useMemo(
    () => [...new Set(scopedEmployees.map((e) => e.department?.trim() || 'Unassigned'))].sort((a, b) => a.localeCompare(b)),
    [scopedEmployees],
  )

  const employeeOptions = useMemo(
    () =>
      scopedEmployees
        .filter((e) => !filterDept || (e.department?.trim() || 'Unassigned') === filterDept)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [scopedEmployees, filterDept],
  )

  // Filter bar — narrows scope further by department, a single employee, and/or
  // an OR-match across selected tech stack skills. Drives stat cards, charts,
  // coverage table, and the "current view" export.
  const filteredEmployees = useMemo(
    () =>
      scopedEmployees
        .filter((e) => !filterDept || (e.department?.trim() || 'Unassigned') === filterDept)
        .filter((e) => !filterEmployee || e.id === filterEmployee)
        .filter((e) => filterTechStack.length === 0 || filterTechStack.some((name) => (skillsByEmp[e.id]?.[name] || 0) > 0)),
    [scopedEmployees, filterDept, filterEmployee, filterTechStack, skillsByEmp],
  )

  const filteredEmpById = useMemo(() => Object.fromEntries(filteredEmployees.map((e) => [e.id, e])), [filteredEmployees])
  const filteredSkills = useMemo(
    () => scopedSkills.filter((s) => filteredEmpById[s.employeeId]),
    [scopedSkills, filteredEmpById],
  )

  const summary = useMemo(() => skillsSummary(filteredEmployees, filteredSkills), [filteredEmployees, filteredSkills])
  const levelChart = useMemo(() => levelDistribution(filteredSkills), [filteredSkills])
  const categoryChart = useMemo(() => categoryCoverage(filteredSkills), [filteredSkills])
  const deptChart = useMemo(() => headcountByDepartment(filteredEmployees), [filteredEmployees])
  const topSkillsChart = useMemo(() => topSkillsByHolders(filteredSkills, 8), [filteredSkills])
  const surveyChart = useMemo(() => surveyCompletion(filteredEmployees, filteredSkills), [filteredEmployees, filteredSkills])

  // Coverage — per skill: holders, level distribution, and gap flags. Respects the full filter set.
  const coverage = useMemo(
    () => coverageBySkill(filteredSkills, filteredEmpById),
    [filteredSkills, filteredEmpById],
  )

  const filtersActive = filterDept || filterEmployee || filterTechStack.length > 0
  const filterSummary = filtersActive
    ? [
        filterDept && `Dept: ${filterDept}`,
        filterEmployee && `Employee: ${filteredEmpById[filterEmployee]?.name || filterEmployee}`,
        filterTechStack.length > 0 && `Tech: ${filterTechStack.join(', ')}`,
      ]
        .filter(Boolean)
        .join(' · ') + ` (${scope === 'team' ? 'my team' : 'all employees'})`
    : `${scope === 'team' ? 'My team' : 'All employees'}, no extra filters`

  if (loading) {
    return (
      <Layout>
        <LoadingSpinner label="Mapping team skills…" />
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Team Skills</h1>
          <p className="text-sm text-ink-muted">
            Analyze skill coverage, find talent for opportunities, and spot knowledge gaps to cross-train.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-surface-border p-0.5 text-sm">
            {[
              { k: 'team', label: 'My team' },
              { k: 'all', label: 'All employees' },
            ].map((o) => (
              <button
                key={o.k}
                type="button"
                onClick={() => setScope(o.k)}
                className={`rounded-md px-3 py-1 font-medium ${scope === o.k ? 'bg-white/10 text-ink' : 'text-ink-muted hover:text-ink'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setShowExport(true)} className="btn-secondary text-sm">
            Export…
          </button>
        </div>
      </div>

      {skillNames.length === 0 ? (
        <div className="mt-6 card text-center text-ink-faint">
          No skills captured yet. Add them from the Skill Matrix tab on each employee&apos;s page.
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Team size" value={summary.teamSize} />
            <StatCard label="People with skills" value={summary.peopleWithSkills} />
            <StatCard label="Distinct skills" value={summary.distinctSkills} />
            <StatCard label="Total ratings" value={summary.totalRatings} />
            <StatCard label="Avg skills / person" value={summary.avgPerPerson} />
          </div>

          {/* Filter bar */}
          <section className="card mt-6">
            <h2 className="font-semibold text-ink">Filters</h2>
            <p className="mb-3 text-sm text-ink-muted">Narrows the charts, coverage table, and the export below.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="font-medium text-ink">Department</span>
                <select
                  value={filterDept}
                  onChange={(e) => {
                    setFilterDept(e.target.value)
                    setFilterEmployee('')
                  }}
                  className="input mt-1"
                >
                  <option value="">All departments</option>
                  {deptOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-ink">Employee</span>
                <select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} className="input mt-1">
                  <option value="">All employees</option>
                  {employeeOptions.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="block text-sm">
                <span className="font-medium text-ink">Tech stack</span>
                <div className="mt-1">
                  <TechStackFilter options={skillNames} selected={filterTechStack} onChange={setFilterTechStack} />
                </div>
              </div>
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setFilterDept('')
                  setFilterEmployee('')
                  setFilterTechStack([])
                }}
                className="mt-3 text-sm text-mint hover:underline"
              >
                Clear filters
              </button>
            )}
          </section>

          {/* Charts */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card">
              <h2 className="font-semibold text-ink">Level distribution</h2>
              <p className="mb-3 text-sm text-ink-muted">How ratings spread across Novice → Expert.</p>
              <BarChart data={levelChart} />
            </section>
            <section className="card">
              <h2 className="font-semibold text-ink">Category coverage</h2>
              <p className="mb-3 text-sm text-ink-muted">People with at least one rating per category.</p>
              <BarChart data={categoryChart} color="#9B84FF" />
            </section>
            <section className="card">
              <h2 className="font-semibold text-ink">Top skills by holders</h2>
              <p className="mb-3 text-sm text-ink-muted">Most widely held skills in view.</p>
              <BarChart data={topSkillsChart} />
            </section>
            <section className="card">
              <h2 className="font-semibold text-ink">Headcount by department</h2>
              <p className="mb-3 text-sm text-ink-muted">Who&apos;s in the current view.</p>
              <BarChart data={deptChart} color="#9B84FF" />
            </section>
            <section className="card lg:col-span-2">
              <h2 className="font-semibold text-ink">Skill Survey completion</h2>
              <p className="mb-3 text-sm text-ink-muted">Who has submitted the public Skill Survey.</p>
              <DonutChart data={surveyChart} />
            </section>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Finder — resource pool for opportunities. Unchanged. */}
            <section className="card">
              <h2 className="font-semibold text-ink">Find talent</h2>
              <p className="mb-3 text-sm text-ink-muted">
                Who can I pull in for an opportunity? Add skills to require all of them.
              </p>

              <div className="space-y-2">
                {criteria.map((c) => (
                  <div key={c.id} className="flex flex-wrap gap-2">
                    <select
                      value={c.skill}
                      onChange={(e) => updateCriterion(c.id, { skill: e.target.value })}
                      className="input flex-1"
                    >
                      <option value="">Select a skill…</option>
                      {skillNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <select
                      value={c.minLevel}
                      onChange={(e) => updateCriterion(c.id, { minLevel: Number(e.target.value) })}
                      className="input w-auto"
                    >
                      {SKILL_LEVELS.map((l) => (
                        <option key={l.n} value={l.n}>
                          ≥ {l.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeCriterion(c.id)}
                      disabled={criteria.length === 1}
                      className="rounded-lg px-2 text-ink-faint hover:text-rose-400 disabled:opacity-30"
                      aria-label="Remove skill"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addCriterion} className="text-sm text-mint hover:underline">
                  + Add another skill
                </button>
              </div>

              <div className="mt-4">
                {activeCriteria.length === 0 ? (
                  <p className="text-sm text-ink-faint">Pick a skill to see who has it.</p>
                ) : matches.length === 0 ? (
                  <p className="text-sm text-ink-faint">
                    Nobody in scope meets{' '}
                    <span className="text-ink">
                      {activeCriteria.map((c) => `${c.skill} ≥ ${LEVEL_LABEL[c.minLevel]}`).join(' + ')}
                    </span>{' '}
                    — a gap to hire or cross-train.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {matches.map((m) => (
                      <li
                        key={m.emp.id}
                        onClick={() => navigate(`/employee/${m.emp.id}`)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 hover:bg-white/5"
                      >
                        <Avatar name={m.emp.name} colorKey={m.emp.id} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{m.emp.name}</span>
                          <span className="block truncate text-xs text-ink-faint">{m.emp.department}</span>
                        </span>
                        <span className="flex flex-wrap justify-end gap-1">
                          {m.levels.map((lv) => (
                            <span
                              key={lv.skill}
                              className="rounded-full bg-mint/10 px-2 py-0.5 text-[11px] text-mint ring-1 ring-inset ring-mint/25"
                              title={`${lv.skill} · ${LEVEL_LABEL[lv.level]}`}
                            >
                              {lv.skill} · {LEVEL_LABEL[lv.level]}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Coverage — gaps to cross-train. Respects the full filter set. */}
            <section className="card">
              <h2 className="font-semibold text-ink">Skill coverage &amp; gaps</h2>
              <p className="mb-3 text-sm text-ink-muted">
                Sorted by biggest gap first. <span className="text-amber-300">Single point</span> = only one person;{' '}
                <span className="text-amber-300">No expert</span> = nobody Advanced+.
              </p>
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {coverage.length === 0 ? (
                  <p className="text-sm text-ink-faint">No skills match the current filters.</p>
                ) : (
                  coverage.map((c) => (
                    <div key={c.name} className="flex items-center gap-3 rounded-lg border border-white/5 p-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                          {c.flags.map((f) => (
                            <span
                              key={f}
                              className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                        <p className="truncate text-xs text-ink-faint">
                          {c.count} {c.count === 1 ? 'person' : 'people'} · top {c.maxLevelLabel}
                        </p>
                      </div>
                      <span className="shrink-0 text-right">
                        <span className="text-sm font-semibold text-ink">{c.count}</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {showExport && (
        <ExportModal
          allEmployees={allEmployees}
          allSkills={skills}
          filteredEmployees={filteredEmployees}
          filteredSkills={filteredSkills}
          filterSummary={filterSummary}
          onClose={() => setShowExport(false)}
        />
      )}
    </Layout>
  )
}
