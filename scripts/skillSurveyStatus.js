#!/usr/bin/env node
// One-off admin tool: reports who has (and hasn't) submitted the public Skill
// Survey (/skills-survey). Every skill doc written by the survey is tagged
// updatedByRole: 'self-survey' (api/skill-survey.js) — distinct from
// 'bulk-import' (scripts/importSkillMatrix.js) and 'admin'/'employee'
// (in-app Skill Matrix edits) — so this is a straight read, no ambiguity
// about which channel a given rating came from.
//
// Usage:
//   node scripts/skillSurveyStatus.js /path/to/serviceAccountKey.json [outputCsvPath]
//
// Read-only — makes no changes to Firestore.
//
// The service account key comes from Firebase console:
//   Project settings -> Service accounts -> Generate new private key

import admin from 'firebase-admin'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { buildCsv } from '../src/lib/csv.js'

async function main() {
  const [keyPath, outArg] = process.argv.slice(2)
  if (!keyPath) {
    console.error('Usage: node scripts/skillSurveyStatus.js /path/to/serviceAccountKey.json [outputCsvPath]')
    process.exit(1)
  }
  if (!existsSync(keyPath)) {
    console.error(`Service account key not found: ${keyPath}`)
    process.exit(1)
  }

  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const db = admin.firestore()

  console.log(`Project: ${serviceAccount.project_id}\n`)

  const [usersSnap, skillsSnap] = await Promise.all([
    db.collection('users').where('role', '==', 'employee').get(),
    db.collection('skills').get(),
  ])

  const employees = usersSnap.docs
    .map((d) => ({ id: d.id, name: d.data().name || 'Unnamed', email: d.data().email || '' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // employeeId -> { count, lastUpdatedAt }
  const surveyByEmp = {}
  for (const doc of skillsSnap.docs) {
    const s = doc.data()
    if (s.updatedByRole !== 'self-survey' || !s.employeeId) continue
    const bucket = (surveyByEmp[s.employeeId] ||= { count: 0, lastUpdatedAt: '' })
    bucket.count++
    if ((s.updatedAt || '') > bucket.lastUpdatedAt) bucket.lastUpdatedAt = s.updatedAt || ''
  }

  const completed = employees.filter((e) => surveyByEmp[e.id])
  const pending = employees.filter((e) => !surveyByEmp[e.id])

  console.log(`=== Completed the survey (${completed.length}/${employees.length}) ===`)
  if (completed.length === 0) console.log('  (none)')
  for (const e of completed) {
    const info = surveyByEmp[e.id]
    const when = info.lastUpdatedAt ? info.lastUpdatedAt.slice(0, 10) : '—'
    console.log(`  ${e.name.padEnd(28)} ${String(info.count).padStart(3)} skill(s)   last: ${when}`)
  }

  console.log(`\n=== NOT yet completed (${pending.length}/${employees.length}) ===`)
  if (pending.length === 0) console.log('  (none — everyone has submitted)')
  for (const e of pending) console.log(`  ${e.name}${e.email ? `  <${e.email}>` : ''}`)

  const outPath = outArg || `skill-survey-status-${new Date().toISOString().slice(0, 10)}.csv`
  const headers = ['Employee Name', 'Employee UUID', 'Email', 'Survey Status', 'Skills via Survey', 'Last Survey Update']
  const rows = employees.map((e) => {
    const info = surveyByEmp[e.id]
    return [
      e.name,
      e.id,
      e.email,
      info ? 'Completed' : 'Not completed',
      info ? info.count : 0,
      info?.lastUpdatedAt ? info.lastUpdatedAt.slice(0, 10) : '',
    ]
  })
  writeFileSync(outPath, buildCsv(headers, rows), 'utf8')
  console.log(`\nFull report written to: ${outPath}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
