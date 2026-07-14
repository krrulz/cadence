#!/usr/bin/env node
// One-off admin tool: creates a Firebase Auth user + matching users/{uid}
// Firestore profile doc. Run locally, never deployed. Needed because the app
// itself can only create accounts once an admin is already logged in — this
// bootstraps that very first admin (or seeds any other account offline).
//
// Usage:
//   npm run create-user -- /path/to/serviceAccountKey.json
//
// The service account key comes from Firebase console:
//   Project settings -> Service accounts -> Generate new private key
// Treat that file as a secret: don't commit it, delete it when you're done.

import admin from 'firebase-admin'
import readline from 'node:readline'
import { readFileSync, existsSync } from 'node:fs'
import { DEFAULT_LEAVE_ENTITLEMENTS } from '../src/lib/constants.js'

function prompt(query, defaultValue) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const suffix = defaultValue ? ` (${defaultValue})` : ''
    rl.question(`${query}${suffix}: `, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue || '')
    })
  })
}

// Echoes '*' is skipped entirely (simplest reliable muting across terminals):
// the password never appears on screen, only newlines pass through so the
// prompt doesn't look frozen.
function promptHidden(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.stdoutMuted = true
    rl._writeToOutput = function (str) {
      if (!rl.stdoutMuted) rl.output.write(str)
      else if (str === '\r\n' || str === '\n') rl.output.write(str)
    }
    rl.question(query, (value) => {
      rl.close()
      process.stdout.write('\n')
      resolve(value)
    })
  })
}

async function main() {
  const keyPath = process.argv[2] || process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyPath || !existsSync(keyPath)) {
    console.error('Usage: npm run create-user -- /path/to/serviceAccountKey.json')
    console.error('(or set GOOGLE_APPLICATION_CREDENTIALS to that path)')
    process.exit(1)
  }

  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

  console.log('--- Create Cadence user ---\n')
  const email = await prompt('Email')
  const password = await promptHidden('Password (not echoed): ')
  const name = await prompt('Full name')
  const roleInput = await prompt('Role: admin or employee', 'admin')
  const role = roleInput.trim().toLowerCase() === 'employee' ? 'employee' : 'admin'
  const department = await prompt('Department', 'Management')
  const managerName = await prompt('Manager name (optional)', '')
  const dateOfJoining = await prompt('Date of joining (YYYY-MM-DD)', new Date().toISOString().slice(0, 10))

  if (!email || !password || !name) {
    console.error('\nEmail, password and name are all required.')
    process.exit(1)
  }

  console.log('\nCreating auth user...')
  const userRecord = await admin.auth().createUser({ email, password, displayName: name })

  console.log('Writing Firestore profile...')
  await admin.firestore().collection('users').doc(userRecord.uid).set({
    name,
    email,
    role,
    department,
    managerName,
    dateOfJoining,
    status: 'Active',
    leaveEntitlements: { ...DEFAULT_LEAVE_ENTITLEMENTS },
  })

  console.log(`\nDone. Created ${role} "${name}" <${email}> (uid: ${userRecord.uid}).`)
  process.exit(0)
}

main().catch((err) => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
