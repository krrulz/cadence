#!/usr/bin/env node
// One-off maintenance tool: wipes test data from Firestore while leaving every
// employee account and profile untouched.
//
// Deletes (by default): goals, feedback, oneOnOnes (including each 1:1's
// notes/ and actions/ subcollections).
// Never touches:        users, and Firebase Auth accounts.
//
// Usage:
//   node scripts/cleanupTestData.js /path/to/serviceAccountKey.json            # dry run
//   node scripts/cleanupTestData.js /path/to/key.json --confirm                # delete
//   node scripts/cleanupTestData.js /path/to/key.json --confirm --yes          # no prompt
//   node scripts/cleanupTestData.js /path/to/key.json --also=recognitions,leaves
//
// It is a DRY RUN unless --confirm is passed: it prints the employee roster it
// is preserving and a per-collection count of what it would delete.
// With --confirm it first writes a full JSON backup to scripts/backups/, then
// asks you to type DELETE before touching anything.
//
// The service account key comes from Firebase console:
//   Project settings -> Service accounts -> Generate new private key
// Treat that file as a secret: don't commit it, delete it when you're done.

import admin from 'firebase-admin'
import readline from 'node:readline'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Collections cleared by default — the ones the user created while testing.
const DEFAULT_TARGETS = ['goals', 'feedback', 'oneOnOnes']
// Collections that carry subcollections needing a recursive delete.
const SUBCOLLECTIONS = { oneOnOnes: ['notes', 'actions'] }
// Guard rail: refuse to delete these even if passed via --also.
const PROTECTED = ['users']

function prompt(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(query, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'))
  const flags = argv.filter((a) => a.startsWith('--'))
  const also = flags.find((f) => f.startsWith('--also='))
  return {
    keyPath: positional[0],
    confirm: flags.includes('--confirm'),
    yes: flags.includes('--yes'),
    also: also ? also.slice('--also='.length).split(',').map((s) => s.trim()).filter(Boolean) : [],
  }
}

async function main() {
  const { keyPath, confirm, yes, also } = parseArgs(process.argv.slice(2))

  if (!keyPath) {
    console.error('Usage: node scripts/cleanupTestData.js /path/to/serviceAccountKey.json [--confirm] [--yes] [--also=col1,col2]')
    process.exit(1)
  }
  if (!existsSync(keyPath)) {
    console.error(`Service account key not found: ${keyPath}`)
    process.exit(1)
  }

  const blocked = also.filter((c) => PROTECTED.includes(c))
  if (blocked.length) {
    console.error(`Refusing to delete protected collection(s): ${blocked.join(', ')}`)
    process.exit(1)
  }

  const targets = [...new Set([...DEFAULT_TARGETS, ...also])]
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const db = admin.firestore()

  console.log(`\nProject: ${serviceAccount.project_id}`)
  console.log(`Mode:    ${confirm ? 'DELETE (irreversible)' : 'DRY RUN (nothing will be deleted)'}`)

  // --- 1. Employee roster: preserved, shown so you can verify it's intact ---
  const usersSnap = await db.collection('users').get()
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const employees = users.filter((u) => u.role === 'employee')
  const admins = users.filter((u) => u.role === 'admin')

  console.log(`\n=== Employee details (PRESERVED — never modified) ===`)
  console.log(`${users.length} account(s): ${admins.length} admin, ${employees.length} employee\n`)
  const pad = (s, n) => String(s ?? '—').slice(0, n).padEnd(n)
  console.log(pad('Name', 26) + pad('Email', 32) + pad('Department', 18) + pad('Birthday', 10) + 'Role')
  console.log('-'.repeat(96))
  for (const u of [...admins, ...employees]) {
    console.log(pad(u.name, 26) + pad(u.email, 32) + pad(u.department, 18) + pad(u.birthday, 10) + (u.role || '—'))
  }

  // --- 2. Gather what would be deleted (and snapshot it for the backup) ---
  console.log(`\n=== Test data to remove ===`)
  const backup = { exportedAt: new Date().toISOString(), project: serviceAccount.project_id, users, collections: {} }
  let grandTotal = 0

  for (const col of targets) {
    const snap = await db.collection(col).get()
    const docs = []
    for (const doc of snap.docs) {
      const record = { id: doc.id, ...doc.data() }
      // Capture subcollections too, so the backup is genuinely restorable.
      for (const sub of SUBCOLLECTIONS[col] || []) {
        const subSnap = await doc.ref.collection(sub).get()
        if (!subSnap.empty) record[`_${sub}`] = subSnap.docs.map((s) => ({ id: s.id, ...s.data() }))
      }
      docs.push(record)
    }
    backup.collections[col] = docs
    grandTotal += docs.length

    const subCounts = (SUBCOLLECTIONS[col] || [])
      .map((sub) => {
        const n = docs.reduce((sum, d) => sum + (d[`_${sub}`]?.length || 0), 0)
        return n ? `${n} ${sub}` : null
      })
      .filter(Boolean)
    console.log(`  ${col.padEnd(14)} ${String(docs.length).padStart(4)} doc(s)${subCounts.length ? `  (+ ${subCounts.join(', ')})` : ''}`)
  }

  if (grandTotal === 0) {
    console.log('\nNothing to delete — those collections are already empty.')
    process.exit(0)
  }

  if (!confirm) {
    console.log(`\n${grandTotal} document(s) would be deleted. No changes made.`)
    console.log('Re-run with --confirm to delete (a JSON backup is written first).\n')
    process.exit(0)
  }

  // --- 3. Backup before destroying anything ---
  const backupDir = join(__dirname, 'backups')
  mkdirSync(backupDir, { recursive: true })
  const backupPath = join(backupDir, `cleanup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8')
  console.log(`\nBackup written: ${backupPath}`)
  console.log('(contains real HR data — keep it safe, it is gitignored)')

  // --- 4. Typed confirmation ---
  if (!yes) {
    const answer = await prompt(`\nType DELETE to permanently remove ${grandTotal} document(s): `)
    if (answer !== 'DELETE') {
      console.log('Aborted. Nothing was deleted.')
      process.exit(0)
    }
  }

  // --- 5. Delete ---
  console.log('')
  for (const col of targets) {
    const docs = backup.collections[col]
    if (!docs.length) continue
    let done = 0
    for (const record of docs) {
      const ref = db.collection(col).doc(record.id)
      // recursiveDelete clears the doc and any subcollections beneath it.
      if (SUBCOLLECTIONS[col]) await db.recursiveDelete(ref)
      else await ref.delete()
      done++
    }
    console.log(`  ${col.padEnd(14)} deleted ${done} doc(s)`)
  }

  console.log(`\nDone. ${grandTotal} document(s) removed. All ${users.length} account(s) left untouched.\n`)
  process.exit(0)
}

main().catch((err) => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
