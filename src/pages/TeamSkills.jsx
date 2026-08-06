import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'
import Avatar from '../components/Avatar.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import { getAllUsers, getAllRecords } from '../lib/firestoreHelpers.js'
import { isManagedBy } from '../lib/manager.js'
import { SKILL_LEVELS } from '../lib/constants.js'

const LEVEL_LABEL = Object.fromEntries(SKILL_LEVELS.map((l) => [l.n, l.label]))

// Read-only 1–5 pips.
function Pips({ level }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`${level} · ${LEVEL_LABEL[level] || ''}`}>
      {SKILL_LEVELS.map((l) => (
        <span
          key={l.n}
          className={`h-2 w-4 rounded-full ${l.n <= level ? 'bg-gradient-to-r from-mint-deep to-mint' : 'bg-white/10'}`}
        />
      ))}
    </span>
  )
}

export default function TeamSkills() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [skills, setSkills] = useState([])
  const [scope, setScope] = useState('team') // 'team' | 'all'
  const [selSkill, setSelSkill] = useState('')
  const [minLevel, setMinLevel] = useState(1)

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

  // Employees in scope, and their skills.
  const { empById, scopedSkills } = useMemo(() => {
    const employees = users.filter(
      (u) => u.role === 'employee' && (scope === 'all' || isManagedBy(u, admin)),
    )
    const byId = Object.fromEntries(employees.map((e) => [e.id, e]))
    return { empById: byId, scopedSkills: skills.filter((sk) => byId[sk.employeeId]) }
  }, [users, skills, scope, admin.uid, admin.name])

  const skillNames = useMemo(
    () => [...new Set(scopedSkills.map((s) => s.name))].sort((a, b) => a.localeCompare(b)),
    [scopedSkills],
  )

  // Finder — people who have the chosen skill at >= minLevel.
  const matches = useMemo(() => {
    if (!selSkill) return []
    return scopedSkills
      .filter((s) => s.name === selSkill && (s.level || 0) >= minLevel)
      .map((s) => ({ ...s, emp: empById[s.employeeId] }))
      .filter((s) => s.emp)
      .sort((a, b) => (b.level || 0) - (a.level || 0) || a.emp.name.localeCompare(b.emp.name))
  }, [scopedSkills, selSkill, minLevel, empById])

  // Coverage — per skill: holders, level distribution, and gap flags.
  const coverage = useMemo(() => {
    const map = new Map()
    for (const s of scopedSkills) {
      if (!map.has(s.name)) map.set(s.name, [])
      map.get(s.name).push({ empId: s.employeeId, name: empById[s.employeeId]?.name || '—', level: s.level || 0 })
    }
    const rows = [...map.entries()].map(([name, holders]) => {
      const maxLevel = Math.max(...holders.map((h) => h.level))
      const advanced = holders.filter((h) => h.level >= 4).length
      const flags = []
      if (holders.length === 1) flags.push('Single point') // bus-factor risk
      if (advanced === 0) flags.push('No expert') // nobody Advanced+
      return { name, holders: holders.sort((a, b) => b.level - a.level), count: holders.length, maxLevel, advanced, flags }
    })
    // Surface the biggest gaps first: fewest holders, then lowest max level.
    return rows.sort((a, b) => a.count - b.count || a.maxLevel - b.maxLevel || a.name.localeCompare(b.name))
  }, [scopedSkills, empById])

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
            Find talent for opportunities and spot knowledge gaps to cross-train.
          </p>
        </div>
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
      </div>

      {skillNames.length === 0 ? (
        <div className="mt-6 card text-center text-ink-faint">
          No skills captured yet. Add them from the Skill Matrix tab on each employee&apos;s page.
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Finder — resource pool for opportunities */}
          <section className="card">
            <h2 className="font-semibold text-ink">Find talent</h2>
            <p className="mb-3 text-sm text-ink-muted">Who can I pull in for an opportunity?</p>
            <div className="flex flex-wrap gap-2">
              <select value={selSkill} onChange={(e) => setSelSkill(e.target.value)} className="input flex-1">
                <option value="">Select a skill…</option>
                {skillNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <select value={minLevel} onChange={(e) => setMinLevel(Number(e.target.value))} className="input w-auto">
                {SKILL_LEVELS.map((l) => (
                  <option key={l.n} value={l.n}>
                    ≥ {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              {!selSkill ? (
                <p className="text-sm text-ink-faint">Pick a skill to see who has it.</p>
              ) : matches.length === 0 ? (
                <p className="text-sm text-ink-faint">
                  Nobody in scope has <span className="text-ink">{selSkill}</span> at {LEVEL_LABEL[minLevel]}+ — a gap to
                  hire or cross-train.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {matches.map((m) => (
                    <li
                      key={m.id}
                      onClick={() => navigate(`/employee/${m.emp.id}`)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 hover:bg-white/5"
                    >
                      <Avatar name={m.emp.name} colorKey={m.emp.id} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{m.emp.name}</span>
                        <span className="block truncate text-xs text-ink-faint">{m.emp.department}</span>
                      </span>
                      <Pips level={m.level} />
                      <span className="w-24 text-right text-xs text-ink-muted">{LEVEL_LABEL[m.level]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Coverage — gaps to cross-train */}
          <section className="card">
            <h2 className="font-semibold text-ink">Skill coverage &amp; gaps</h2>
            <p className="mb-3 text-sm text-ink-muted">
              Sorted by biggest gap first. <span className="text-amber-300">Single point</span> = only one person;{' '}
              <span className="text-amber-300">No expert</span> = nobody Advanced+.
            </p>
            <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
              {coverage.map((c) => (
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
                      {c.count} {c.count === 1 ? 'person' : 'people'} · top {LEVEL_LABEL[c.maxLevel]}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span className="text-sm font-semibold text-ink">{c.count}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Layout>
  )
}
