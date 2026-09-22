#!/usr/bin/env node
// One-off local tool: seeds the Send-off Wall (farewellWishes) with
// realistic-looking test submissions so you can preview /farewell-admin
// (vote tallies, the collage renderer, moderation) without waiting for real
// people to fill it in.
//
// Usage:
//   node scripts/seedFarewellTestData.js /path/to/serviceAccountKey.json            # dry run
//   node scripts/seedFarewellTestData.js /path/to/key.json --confirm                # write 35
//   node scripts/seedFarewellTestData.js /path/to/key.json --confirm --count=50
//   node scripts/seedFarewellTestData.js /path/to/key.json --confirm --yes          # no prompt
//
// It is a DRY RUN unless --confirm is passed. Also makes sure
// farewellSettings/config exists and is open (only creates it if missing —
// never overwrites an existing open/closed state).
//
// The service account key comes from Firebase console:
//   Project settings -> Service accounts -> Generate new private key
// Treat that file as a secret: don't commit it, delete it when you're done.

import admin from 'firebase-admin'
import readline from 'node:readline'
import { readFileSync, existsSync } from 'node:fs'

const BACKGROUND_IDS = ['aurora', 'confetti', 'constellation', 'journey', 'botanical']

const FIRST_NAMES = [
  'Priya', 'Arjun', 'Sofia', 'Wei', 'Liam', 'Fatima', 'Carlos', 'Emma', 'Raj', 'Nina',
  'Tom', 'Aisha', 'Yuki', 'Mateus', 'Grace', 'Omar', 'Ivy', 'Noah', 'Zara', 'Leo',
  'Maya', 'Jack', 'Elena', 'Dmitri', 'Ana', 'Sanjay', 'Chloe', 'Hassan', 'Freya', 'Pedro',
  'Meera', 'Oscar', 'Lena', 'Ravi', 'Nadia',
]
const LAST_NAMES = [
  'Nair', 'Menon', 'Rossi', 'Zhang', "O'Brien", 'Khan', 'Diaz', 'Wilson', 'Patel', 'Petrova',
  'Baker', 'Bello', 'Tanaka', 'Silva', 'Lee', 'Farouk', 'Chen', 'Cohen', 'Ahmed', 'Fischer',
  'Singh', 'Murphy', 'Popov', 'Orlov', 'Costa', 'Iyer', 'Martin', 'Ali', 'Andersen', 'Alves',
  'Krishnan', 'Novak', 'Weber', 'Kumar', 'Hussain',
]

// Kept to <=20 words each, matching the real submission cap.
const MESSAGE_TEMPLATES = [
  'Working with you has been a highlight of my career. Wishing you incredible success in this next chapter!',
  'Best manager I have ever had. Thank you for having our backs. Go crush it out there!',
  "Can't believe you're leaving. Never a dull moment with you around. Take care and stay in touch!",
  'You made even the toughest sprints feel manageable. We will miss your jokes in standup!',
  'Wishing you all the best in your next adventure. Congratulations, you deserve it!',
  'It was an honor learning from you. Go get em in the next chapter!',
  'Thank you for believing in me when I doubted myself. Best of luck!',
  'Your leadership made this such a great place to work. Wishing you continued success!',
  'From day one you made me feel welcome here. Good luck on the next journey!',
  "So many great memories together. You'll be missed dearly. Farewell and good luck!",
  'You always knew how to keep the team motivated. Thank you for your guidance!',
  'Wishing you smooth sailing ahead. Thanks for all the coffee chats and advice!',
  'Best of luck!',
  'Congrats on the next chapter — you earned it!',
  'Thank you for everything, boss. We will miss you a lot!',
]

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function makeFakeWish(i) {
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`
  const message = pick(MESSAGE_TEMPLATES)
  const backgroundId = BACKGROUND_IDS[i % BACKGROUND_IDS.length]
  return { name, message, backgroundId }
}

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
  const countFlag = flags.find((f) => f.startsWith('--count='))
  return {
    keyPath: positional[0],
    confirm: flags.includes('--confirm'),
    yes: flags.includes('--yes'),
    count: countFlag ? Number(countFlag.slice('--count='.length)) : 35,
  }
}

async function main() {
  const { keyPath, confirm, yes, count } = parseArgs(process.argv.slice(2))

  if (!keyPath) {
    console.error('Usage: node scripts/seedFarewellTestData.js /path/to/serviceAccountKey.json [--confirm] [--count=35] [--yes]')
    process.exit(1)
  }
  if (!existsSync(keyPath)) {
    console.error(`Service account key not found: ${keyPath}`)
    process.exit(1)
  }
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    console.error('--count must be a whole number between 1 and 500.')
    process.exit(1)
  }

  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'))
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  const db = admin.firestore()

  console.log(`\nProject: ${serviceAccount.project_id}`)
  console.log(`Mode:    ${confirm ? `WRITE ${count} test wish(es)` : 'DRY RUN (nothing will be written)'}\n`)

  const wishes = Array.from({ length: count }, (_, i) => makeFakeWish(i))
  const tally = {}
  for (const w of wishes) tally[w.backgroundId] = (tally[w.backgroundId] || 0) + 1

  console.log('Vote spread across backgrounds:')
  for (const id of BACKGROUND_IDS) console.log(`  ${id.padEnd(14)} ${tally[id] || 0}`)

  if (!confirm) {
    console.log(`\n${count} test wish(es) would be written to farewellWishes, each with an id like test-seed-0.`)
    console.log('Re-run with --confirm to write them.\n')
    process.exit(0)
  }

  if (!yes) {
    const answer = await prompt(`\nType SEED to write ${count} test wish(es) to farewellWishes: `)
    if (answer !== 'SEED') {
      console.log('Aborted. Nothing was written.')
      process.exit(0)
    }
  }

  const settingsRef = db.collection('farewellSettings').doc('config')
  const settingsDoc = await settingsRef.get()
  if (!settingsDoc.exists) {
    await settingsRef.set({ isOpen: true, honoreeName: 'Ragunathan Palanisamy' })
    console.log('\nCreated farewellSettings/config (isOpen: true) — none existed yet.')
  } else {
    console.log(`\nfarewellSettings/config already exists (isOpen: ${settingsDoc.data().isOpen !== false}) — left as-is.`)
  }

  const now = new Date().toISOString()
  const batchSize = 400 // Firestore batch limit is 500 writes
  for (let start = 0; start < wishes.length; start += batchSize) {
    const batch = db.batch()
    for (const [i, w] of wishes.slice(start, start + batchSize).entries()) {
      const ref = db.collection('farewellWishes').doc(`test-seed-${start + i}`)
      batch.set(ref, { ...w, createdAt: now, updatedAt: now })
    }
    await batch.commit()
  }

  console.log(`\nDone. ${count} test wish(es) written with ids test-seed-0 .. test-seed-${count - 1}.`)
  console.log('Open /farewell-admin to see them. Delete them from that page (Delete button per row) when you’re done testing.\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('\nFailed:', err.message)
  process.exit(1)
})
