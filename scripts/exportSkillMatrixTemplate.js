#!/usr/bin/env node
// One-off admin tool: exports every employee (name + UUID) plus every skill
// matrix topic as a fill-in-the-blank CSV (opens directly in Excel) for
// offline bulk data collection. Hand the file to whoever's rating people,
// get it back filled in, then run scripts/importSkillMatrix.js on it.
//
// Usage:
//   node scripts/exportSkillMatrixTemplate.js /path/to/serviceAccountKey.json [outputPath]
//
// Any skill level already recorded in Firestore is pre-filled, so
// re-exporting later reflects current state and only gaps need completing.
//
// The service account key comes from Firebase console:
//   Project settings -> Service accounts -> Generate new private key
// Treat that file as a secret: don't commit it, delete it when you're done.

import admin from 'firebase-admin'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { SKILL_CATEGORIES, SKILL_CATALOG } from '../src/lib/constants.js'
import { buildCsv } from '../src/lib/csv.js'

async function main() {
  const [keyPath, outArg] = process.argv.slice(2)
  if (!keyPath) {
    console.error('Usage: node scripts/exportSkillMatrixTemplate.js /path/to/serviceAccountKey.json [outputPath]')
    process.exit(1)
  }
  if (!existsSync(keyPath)) {
    console.error(`Service account key not found: ${keyPath}`)
    process.exit(1)
  }

  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const db = admin.firestore()

  console.log(`Project: ${serviceAccount.project_id}`)

  const [usersSnap, skillsSnap] = await Promise.all([
    db.collection('users').where('role', '==', 'employee').get(),
    db.collection('skills').get(),
  ])

  const employees = usersSnap.docs
    .map((d) => ({ id: d.id, name: d.data().name || 'Unnamed' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // employeeId -> "category::topic" -> level, so existing ratings pre-fill.
  const existingByEmp = {}
  for (const doc of skillsSnap.docs) {
    const s = doc.data()
    if (!s.employeeId) continue
    existingByEmp[s.employeeId] ||= {}
    existingByEmp[s.employeeId][`${s.category}::${s.name}`] = s.level
  }

  // Flat column list across every category/topic, in catalog order.
  const columns = []
  for (const category of SKILL_CATEGORIES) {
    for (const topic of SKILL_CATALOG[category]) columns.push({ category, topic })
  }

  const headers = ['Employee Name', 'Employee UUID', ...columns.map((c) => `${c.category}: ${c.topic}`)]
  const rows = employees.map((emp) => {
    const existing = existingByEmp[emp.id] || {}
    const cells = columns.map((c) => {
      const lvl = existing[`${c.category}::${c.topic}`]
      return lvl ? String(lvl) : ''
    })
    return [emp.name, emp.id, ...cells]
  })

  const csv = buildCsv(headers, rows)
  const outPath = outArg || `skill-matrix-template-${new Date().toISOString().slice(0, 10)}.csv`
  writeFileSync(outPath, csv, 'utf8')

  console.log(`\nWrote ${employees.length} employee(s) × ${columns.length} skill column(s) to:`)
  console.log(`  ${outPath}`)
  console.log('\nOpen it in Excel. Fill a level 1-5 (Novice..Expert) in any cell to set it; leave blank to skip.')
  console.log('Do not edit the "Employee Name" or "Employee UUID" columns, or add/remove/reorder columns —')
  console.log('the import matches columns by their exact header text.')
  console.log(`\nWhen it's filled in, run:\n  node scripts/importSkillMatrix.js /path/to/key.json ${outPath}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
