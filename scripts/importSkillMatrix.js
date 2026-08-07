#!/usr/bin/env node
// One-off admin tool: bulk-imports skill levels from a CSV produced by
// scripts/exportSkillMatrixTemplate.js back into the `skills` collection.
// Upserts by (employeeId, skill name) — same rule the public Skill Survey
// endpoint uses — so re-running the same file is safe: it updates existing
// levels instead of duplicating rows.
//
// Usage:
//   node scripts/importSkillMatrix.js /path/to/serviceAccountKey.json /path/to/filled.csv             # dry run
//   node scripts/importSkillMatrix.js /path/to/serviceAccountKey.json /path/to/filled.csv --confirm    # write
//   node scripts/importSkillMatrix.js /path/to/serviceAccountKey.json /path/to/filled.csv --confirm --yes   # no prompt
//
// It is a DRY RUN unless --confirm is passed: it validates the file and
// prints exactly what would be written, without touching Firestore.

import admin from 'firebase-admin'
import readline from 'node:readline'
import { readFileSync, existsSync } from 'node:fs'
import { parseCsv } from '../src/lib/csv.js'

const VALID_CATEGORIES = ['Professional Skills', 'Tools/Technologies', 'Domain Knowledge', 'Soft Skill']

function prompt(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(query, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// "Professional Skills: Backend Development" -> { category, topic } | null
function parseColumnHeader(raw) {
  const idx = raw.indexOf(':')
  if (idx === -1) return null
  const category = raw.slice(0, idx).trim()
  const topic = raw.slice(idx + 1).trim()
  if (!VALID_CATEGORIES.includes(category) || !topic) return null
  return { category, topic }
}

async function main() {
  const args = process.argv.slice(2)
  const confirm = args.includes('--confirm')
  const yes = args.includes('--yes')
  const [keyPath, csvPath] = args.filter((a) => !a.startsWith('--'))

  if (!keyPath || !csvPath) {
    console.error(
      'Usage: node scripts/importSkillMatrix.js /path/to/serviceAccountKey.json /path/to/filled.csv [--confirm] [--yes]',
    )
    process.exit(1)
  }
  if (!existsSync(keyPath)) {
    console.error(`Service account key not found: ${keyPath}`)
    process.exit(1)
  }
  if (!existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`)
    process.exit(1)
  }

  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const db = admin.firestore()

  console.log(`\nProject: ${serviceAccount.project_id}`)
  console.log(`Mode:    ${confirm ? 'IMPORT (writes to Firestore)' : 'DRY RUN (nothing will be written)'}`)

  const rawText = readFileSync(csvPath, 'utf8')
  const firstLine = rawText.split(/\r\n|\n|\r/).find((l) => l.trim() !== '') || ''
  // Headers are plain skill/category names with no commas or quotes, so a
  // simple split is safe (the same file's data rows go through the
  // quote-aware parseCsv() below).
  const rawHeaders = firstLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim())
  const rows = parseCsv(rawText)

  if (
    rawHeaders.length < 3 ||
    rawHeaders[0].toLowerCase() !== 'employee name' ||
    rawHeaders[1].toLowerCase() !== 'employee uuid'
  ) {
    console.error(
      'Unrecognized file format — expected "Employee Name, Employee UUID, ..." as produced by exportSkillMatrixTemplate.js.',
    )
    process.exit(1)
  }

  const skillColumns = rawHeaders.slice(2).map((h) => ({ raw: h, parsed: parseColumnHeader(h) }))
  const unrecognized = skillColumns.filter((c) => !c.parsed)
  if (unrecognized.length) {
    console.log(`\n${unrecognized.length} column(s) didn't match a known "Category: Topic" format and will be skipped:`)
    unrecognized.forEach((c) => console.log(`  - ${c.raw}`))
  }

  // Confirm every UUID in the sheet is a real, current employee.
  const usersSnap = await db.collection('users').where('role', '==', 'employee').get()
  const knownIds = new Set(usersSnap.docs.map((d) => d.id))

  const toImport = [] // { employeeId, employeeName, category, name, level }
  const warnings = []

  rows.forEach((row, i) => {
    const rowNum = i + 2 // +1 for the header row, +1 for 1-indexing
    const employeeId = row['employee uuid']
    const employeeName = row['employee name']
    if (!employeeId) {
      warnings.push(`Row ${rowNum} (${employeeName || '?'}): missing Employee UUID — skipped.`)
      return
    }
    if (!knownIds.has(employeeId)) {
      warnings.push(`Row ${rowNum} (${employeeName || employeeId}): UUID doesn't match a current employee — skipped.`)
      return
    }
    for (const col of skillColumns) {
      if (!col.parsed) continue
      const raw = (row[col.raw.toLowerCase()] || '').trim()
      if (!raw) continue
      const level = Number(raw)
      if (!Number.isInteger(level) || level < 1 || level > 5) {
        warnings.push(`Row ${rowNum} (${employeeName}), "${col.raw}": "${raw}" is not a whole number 1-5 — skipped.`)
        continue
      }
      toImport.push({ employeeId, employeeName, category: col.parsed.category, name: col.parsed.topic, level })
    }
  })

  console.log(`\n${rows.length} employee row(s) read, ${toImport.length} skill value(s) to import.`)
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`)
    warnings.slice(0, 30).forEach((w) => console.log(`  - ${w}`))
    if (warnings.length > 30) console.log(`  ... and ${warnings.length - 30} more.`)
  }

  if (toImport.length === 0) {
    console.log('\nNothing to import.')
    process.exit(0)
  }

  const employeeCount = new Set(toImport.map((t) => t.employeeId)).size

  if (!confirm) {
    console.log(`\nRe-run with --confirm to write these ${toImport.length} value(s) to Firestore.\n`)
    process.exit(0)
  }

  if (!yes) {
    const answer = await prompt(`\nType IMPORT to write ${toImport.length} skill value(s) across ${employeeCount} employee(s): `)
    if (answer !== 'IMPORT') {
      console.log('Aborted. Nothing was written.')
      process.exit(0)
    }
  }

  // Upsert by (employeeId, name) — mirrors api/skill-survey.js so importing
  // the same file twice updates levels instead of duplicating rows.
  const byEmployee = {}
  for (const item of toImport) (byEmployee[item.employeeId] ||= []).push(item)

  let written = 0
  const now = new Date().toISOString()
  for (const [employeeId, items] of Object.entries(byEmployee)) {
    const existingSnap = await db.collection('skills').where('employeeId', '==', employeeId).get()
    const existingByName = new Map(existingSnap.docs.map((d) => [d.data().name, d.ref]))

    const batch = db.batch()
    for (const item of items) {
      const existingRef = existingByName.get(item.name)
      const ref = existingRef || db.collection('skills').doc()
      const data = {
        employeeId,
        name: item.name,
        category: item.category,
        level: item.level,
        updatedByRole: 'bulk-import',
        updatedAt: now,
      }
      if (!existingRef) data.createdAt = now
      batch.set(ref, data, { merge: true })
      written++
    }
    await batch.commit()
  }

  console.log(`\nDone. Imported ${written} skill value(s) across ${Object.keys(byEmployee).length} employee(s).\n`)
  process.exit(0)
}

main().catch((err) => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
