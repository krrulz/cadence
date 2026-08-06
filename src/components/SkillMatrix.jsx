import { useCallback, useEffect, useMemo, useState } from 'react'
import Section from './Section.jsx'
import { getRecordsForEmployee, addRecord, updateRecord, deleteRecord } from '../lib/firestoreHelpers.js'
import { SKILL_CATEGORIES, SKILL_LEVELS } from '../lib/constants.js'

const LEVEL_LABEL = Object.fromEntries(SKILL_LEVELS.map((l) => [l.n, l.label]))

// Interactive 1–5 expertise pips. Clicking a pip sets the level.
function LevelPips({ level, onSet }) {
  return (
    <div className="flex items-center gap-1">
      {SKILL_LEVELS.map((l) => (
        <button
          key={l.n}
          type="button"
          title={`${l.n} · ${l.label}`}
          aria-label={`Set level ${l.n} (${l.label})`}
          onClick={() => onSet(l.n)}
          className={`h-2.5 w-6 rounded-full transition-colors ${
            l.n <= level ? 'bg-gradient-to-r from-mint-deep to-mint' : 'bg-white/10 hover:bg-white/20'
          }`}
        />
      ))}
      <span className="ml-2 w-24 text-xs text-ink-muted">{LEVEL_LABEL[level] || 'Not set'}</span>
    </div>
  )
}

// Collaborative skill matrix for one employee. `viewer` = { uid, name, role }.
export default function SkillMatrix({ employeeId, viewer }) {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [category, setCategory] = useState(SKILL_CATEGORIES[0])
  const [level, setLevel] = useState(3)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await getRecordsForEmployee('skills', employeeId)
    setSkills(rows)
    setLoading(false)
  }, [employeeId])

  useEffect(() => {
    load()
  }, [load])

  // Group by category in the canonical order, extras last.
  const grouped = useMemo(() => {
    const order = [...SKILL_CATEGORIES]
    const map = new Map()
    for (const s of skills) {
      const cat = s.category || 'Other'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(s)
    }
    return [...map.entries()]
      .sort((a, b) => {
        const ia = order.indexOf(a[0])
        const ib = order.indexOf(b[0])
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a[0].localeCompare(b[0])
      })
      .map(([cat, items]) => [cat, items.sort((x, y) => (x.name || '').localeCompare(y.name || ''))])
  }, [skills])

  async function addSkill(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    await addRecord('skills', {
      employeeId,
      name: name.trim(),
      category,
      level,
      updatedByUid: viewer?.uid || '',
      updatedByRole: viewer?.role || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setName('')
    setLevel(3)
    setSaving(false)
    load()
  }

  async function setSkillLevel(skill, nextLevel) {
    // Optimistic — persist in the background.
    setSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, level: nextLevel } : s)))
    try {
      await updateRecord('skills', skill.id, {
        level: nextLevel,
        updatedByUid: viewer?.uid || '',
        updatedAt: new Date().toISOString(),
      })
    } catch {
      load()
    }
  }

  async function removeSkill(id) {
    await deleteRecord('skills', id)
    load()
  }

  return (
    <Section title="Skill Matrix">
      {/* Add-skill form */}
      <form onSubmit={addSkill} className="mb-4 flex flex-wrap items-end gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Skill (e.g. React, SQL, Stakeholder mgmt)"
          className="input flex-1 sm:min-w-[220px]"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input w-auto py-2">
          {SKILL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="input w-auto py-2">
          {SKILL_LEVELS.map((l) => (
            <option key={l.n} value={l.n}>
              {l.n} · {l.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Adding…' : '+ Add skill'}
        </button>
      </form>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
        <span>Expertise:</span>
        {SKILL_LEVELS.map((l) => (
          <span key={l.n}>
            {l.n} {l.label}
          </span>
        ))}
      </div>

      {loading ? (
        <p className="py-6 text-center text-ink-faint">Loading…</p>
      ) : grouped.length === 0 ? (
        <p className="py-6 text-center text-ink-faint">No skills captured yet. Add the first above.</p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <h4 className="text-sm font-semibold text-ink">{cat}</h4>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-ink-faint">{items.length}</span>
              </div>
              <ul className="divide-y divide-white/5">
                {items.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span className="min-w-[140px] flex-1 truncate text-sm font-medium text-ink" title={s.name}>
                      {s.name}
                    </span>
                    <LevelPips level={s.level || 0} onSet={(n) => setSkillLevel(s, n)} />
                    <button
                      type="button"
                      onClick={() => removeSkill(s.id)}
                      className="text-xs text-ink-faint hover:text-rose-400"
                      aria-label={`Remove ${s.name}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
