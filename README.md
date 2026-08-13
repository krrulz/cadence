# Cadence

A Firebase-backed replacement for a spreadsheet-based people-management tracker. Employees sign in and see only their own records; the admin sees and manages everyone's.

Built with Vite + React + Tailwind, Firebase Authentication (email/password) and Firestore, deployed as a static app on Vercel.

## Tech stack

- Vite + React (JS)
- Tailwind CSS
- react-router-dom
- Firebase Authentication (email/password, no self-signup)
- Firestore (Spark/free plan)
- Vercel (static hosting + serverless functions for the optional AI email, admin delete-employee, and email-alert features)
- Cloudflare Workers AI (optional — powers "Rewrite with AI"; see [§6](#6-ai-email-composition-optional))

## 1. Firebase project setup

1. Go to the [Firebase console](https://console.firebase.google.com/) and create a new project (or use an existing one).
2. **Add a Web App** to the project (Project settings → General → Your apps → Add app → Web). Copy the resulting config values — you'll need them for `.env.local` below.
3. **Enable Email/Password authentication**: Build → Authentication → Sign-in method → enable "Email/Password". Leave "Email link" off. Do **not** enable self-service sign-up in the app — accounts are only created by the admin from within the app (or manually in the console for the first admin, see step 4).
4. **Create Firestore database**: Build → Firestore Database → Create database → start in production mode (the rules in `firestore.rules` handle access control).
5. **Deploy the security rules**:
   ```bash
   npm install -g firebase-tools   # if you don't have it
   firebase login
   firebase init firestore         # select your existing project, keep firestore.rules as-is
   firebase deploy --only firestore:rules
   ```
   Or paste the contents of [`firestore.rules`](./firestore.rules) directly into Firestore → Rules in the console and publish.

## 2. Creating the first admin user

The app can only create new accounts *from inside* the app, and only an admin can do that — so the very first admin account has to be created out-of-band, once. Two ways to do it:

### Option A — Firebase console (no extra tooling)

1. **Authentication → Users → Add user**: enter your email and a password. Note the generated **User UID**.
2. **Firestore Database → Start collection** (if `users` doesn't exist yet) → collection ID `users` → document ID: paste the UID from step 1. Add these fields:
   | Field | Type | Value |
   |---|---|---|
   | `name` | string | Your name |
   | `email` | string | same email as the auth user |
   | `role` | string | `admin` |
   | `department` | string | e.g. `Management` |
   | `managerName` | string | (optional) |
   | `dateOfJoining` | string | e.g. `2020-01-01` |
   | `status` | string | `Active` |

### Option B — `scripts/createUser.js`

A local script that does both steps (Auth user + Firestore profile doc) in one go, using the Firebase Admin SDK. Useful for the first admin, and for seeding test accounts later.

1. Generate a service account key: Firebase console → **Project settings → Service accounts → Generate new private key**. This downloads a JSON file — treat it as a secret (it grants full admin access to your project). It's covered by `.gitignore`, but don't move it somewhere that isn't.
2. Run:
   ```bash
   npm run create-user -- /path/to/serviceAccountKey.json
   ```
3. Answer the prompts (email, password, name, role, department, ...). The password is not echoed to the terminal and is never sent anywhere but Firebase.
4. Delete the service account key file once you're done with it, unless you plan to reuse it.

Either way, sign in to the app with that email/password once the account exists — you'll land on the Admin Dashboard. From there, use **+ Add Employee** to create every other account (admin or employee) going forward.

## 3. Environment variables

Copy `.env.example` to `.env.local` and fill in the values from Firebase (step 1.2):

```bash
cp .env.example .env.local
```

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

`.env.local` is gitignored — never commit real credentials.

## 4. Local development

```bash
npm install
npm run dev
```

## 5. Deploying to Vercel

1. **Import the repo**: [vercel.com/new](https://vercel.com/new) → import `krrulz/cadence` → Vercel auto-detects the Vite preset (build command `npm run build`, output directory `dist`). Leave those as detected.
2. **Settings → Environment Variables**: add the six `VITE_FIREBASE_*` variables (with real values) for Production (and Preview, if used). If you want the AI email feature, add the server-side variables from §6 here too.
3. Push to `main` — Vercel builds and deploys automatically from then on.

The serverless function in `api/` needs no extra configuration: Vercel picks up that directory by convention.

**Add your Vercel domain to Firebase**: Firebase console → Authentication → Settings → Authorized domains → add the `*.vercel.app` domain Vercel gives you (and any custom domain). Sign-in fails on an unauthorized domain.

Firestore rules are deployed separately via the Firebase CLI/console (step 1.5), not via Vercel.

## 6. AI email composition (optional)

The **Compose Email** modal has a **✨ Rewrite with AI** button that turns the selected records into warm, human prose instead of a bulleted summary. It's powered by [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/), called from a Vercel Serverless Function at [`api/compose-email.js`](./api/compose-email.js).

**The whole feature is optional** — if the environment variables below aren't set, everything else works and the button just reports that the server isn't configured.

### Why a serverless function?

The Cloudflare API token must never reach the browser. Anything prefixed `VITE_` is inlined into the client bundle by Vite and readable by anyone who opens devtools, so these variables deliberately have **no `VITE_` prefix** and are only read server-side.

### Setup

You do **not** need to own a domain — a free Cloudflare account with no domains attached is enough for Workers AI.

1. **Sign up / sign in** at [dash.cloudflare.com](https://dash.cloudflare.com/). No domain and no card required; skip any "add a site" prompt.
2. **Account ID**: left sidebar → **Compute (Workers)** / **Workers & Pages** → the Account ID is shown in the right sidebar. If you can't see it, read it out of the dashboard URL — `dash.cloudflare.com/<account-id>/...` — it's the long hex string.
3. **API token**: top-right avatar → **My Profile** → **API Tokens** → **Create Token** → use the **Workers AI** template if offered, otherwise **Create Custom Token** with permission `Account → Workers AI → Read`. Copy it immediately — it's shown once and cannot be retrieved later.
3. **Set the variables** in `.env.local` for local dev and in Vercel → Settings → Environment Variables for production:
   ```
   CF_ACCOUNT_ID=<your account id>
   CF_API_TOKEN=<your workers ai token>
   FIREBASE_PROJECT_ID=teamtracker-a9333   # same value as VITE_FIREBASE_PROJECT_ID
   CF_AI_MODEL=                            # optional; defaults to @cf/meta/llama-3.1-8b-instruct
   ```
4. **Test locally**: just `npm run dev`. A small dev-server plugin in [`vite.config.js`](./vite.config.js) runs the `api/` handlers and passes the non-`VITE_` variables through to them, so the button works locally exactly as it does in production. (Vite has no knowledge of `api/` on its own — without that plugin `/api/*` returns an empty 404. `npx vercel dev` also works if you prefer.) Restart the dev server after changing `.env.local`.

### Security

`api/compose-email.js` is a publicly reachable URL, so it verifies the caller's Firebase ID token before spending any Workers AI quota — an unauthenticated request is rejected with a 401. Verification is done against Google's published signing certs using Node's built-in crypto (no `firebase-admin` dependency); see [`api/_verifyFirebaseToken.js`](./api/_verifyFirebaseToken.js).

### Privacy note

This feature sends the selected records — which can include **named employees' grievances, performance ratings and feedback** — to Cloudflare for processing. Cloudflare Workers AI was chosen over free tiers that train on submitted data (Google's Gemini free tier does, for example). **Verify Cloudflare's current terms yourself before relying on this**, and consider whether your GDPR basis covers it. Nothing is sent unless an admin clicks "Rewrite with AI", and no email is ever sent by the app — the draft only ever goes to your own clipboard or email client.

## 7. Admin account actions (reset password & delete employee)

**Passwords are never stored in Firestore.** Firebase Authentication stores them hashed; the app only ever asks Firebase to send a reset email or (via the Admin SDK) to set a new one. Nothing writes a password into the database.

Anyone signed in can change **their own** password from the **Password** button in the header (`ChangePasswordModal` → Firebase `updatePassword`, after re-authenticating with the current password). This needs no backend and works immediately.

Each employee's detail page has these admin-only controls in the header:

- **Set password** — set a new sign-in password for the employee directly, in-portal. Uses the Admin SDK serverless endpoint [`api/set-password.js`](./api/set-password.js) (`auth().updateUser`), so it needs the same `FIREBASE_SERVICE_ACCOUNT` as delete-employee; inert until that is configured. The password goes to Firebase Auth, never Firestore.
- **Email reset link** — sends Firebase's standard password-reset email (`sendPasswordResetEmail`); pure client-side, no backend needed.
- **Delete employee** — **permanently** deletes the login account **and** every record (performance, grievances, recognitions, feedback, leave, 1:1s including their sub-notes and action items). A typed-name confirmation is required. This cannot be undone.

### Delete requires a service-account key

Deleting another user's Auth account and cascading their data can only be done server-side with the Firebase **Admin SDK**, so the delete button calls [`api/delete-employee.js`](./api/delete-employee.js). Until the key below is set, the button works but returns *"Server not configured"* — nothing is deleted.

1. Firebase console → **Project settings** → **Service accounts** → **Generate new private key**. This downloads a JSON file. **Treat it like a root password** — it bypasses all Firestore rules. Never commit it (`.env*` is gitignored).
2. Set these variables in `.env.local` (local dev) and Vercel → Settings → Environment Variables (production). `FIREBASE_SERVICE_ACCOUNT` is the **entire JSON file contents on one line**:
   ```
   FIREBASE_PROJECT_ID=teamtracker-a9333   # same value as VITE_FIREBASE_PROJECT_ID
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"…", … }
   ```
   (`FIREBASE_PROJECT_ID` is shared with the AI feature — set it once.)
3. The endpoint re-verifies the caller's Firebase ID token **and** checks their `users/{uid}.role === 'admin'` server-side before deleting, so it can't be abused by a non-admin who finds the URL. It also refuses to let an admin delete their own account.

## 8. Email alerts (optional)

Cadence can email a short notification when something relevant happens — a leave request approved/rejected, new feedback or performance review, a grievance status change (→ the employee), and a new leave request or grievance (→ all admins). Alerts are sent server-side via [`api/send-alert.js`](./api/send-alert.js) using any SMTP server you provide.

**The feature is entirely optional and best-effort.** With no SMTP variables set, the endpoint returns `{ skipped: true }` and the app behaves exactly as before — an alert never blocks or fails the action that triggered it, and the client swallows all alert errors.

### Setup

1. Get SMTP credentials from any provider (a free tier of Brevo, Mailjet, Resend-SMTP, or even a Gmail app password works).
2. Set these server-side variables (no `VITE_` prefix) in `.env.local` and Vercel → Settings → Environment Variables:
   ```
   SMTP_HOST=smtp.your-provider.com
   SMTP_PORT=587                     # 465 for implicit TLS
   SMTP_SECURE=false                 # 'true' only for port 465
   SMTP_USER=<smtp username>
   SMTP_PASS=<smtp password>
   SMTP_FROM="Cadence <noreply@yourdomain.com>"
   FIREBASE_PROJECT_ID=teamtracker-a9333   # shared with the other functions
   ```
3. The endpoint verifies the caller's Firebase ID token before sending, caps recipients, and only sends to valid-looking addresses — it can't be used as an open relay.

> Note: `nodemailer` is a runtime dependency of this function. No email is ever sent unless SMTP is configured, and the content is a short "log in to view" nudge — the actual records stay in the app.

## 9. Skill Survey (public, no login required)

`/skills-survey` is a **public page** — for employees who don't have a Cadence login yet to self-report their skills. It writes into the same `skills` collection the in-app Skill Matrix uses, so submissions show up under that employee's matrix automatically.

**Security model**: the page never talks to Firestore directly. Every read/write goes through [`api/skill-survey.js`](./api/skill-survey.js), which uses the Admin SDK (bypassing security rules) and is gated by a **shared passcode** checked server-side. The client-side `skills` Firestore rules are completely unchanged — there is no rule that lets an anonymous browser write to `skills`; this endpoint is the only path. The employee picker only ever exposes **names** (no email/department), and only after the correct passcode is supplied.

Flow: enter passcode → pick your name from a dropdown → a confirmation screen ("You're about to fill this out as NAME") to guard against picking the wrong person → rate skills (seeded catalog per category, plus a free-text "add your own" per category) → submit. A resubmission for the same person updates existing skill levels rather than duplicating rows.

### Setup

1. Set a passcode and share it with the team through whatever channel you already use to distribute the survey link (email, chat) — **not** committed anywhere.
2. Add these variables in `.env.local` (local dev) and Vercel → Settings → Environment Variables (production):
   ```
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account", …}   # same as §7/§8
   FIREBASE_PROJECT_ID=teamtracker-a9333                    # shared with the other functions
   SKILL_SURVEY_PASSCODE=<a code you choose>
   ```
3. Share the link: `https://<your-vercel-domain>/skills-survey`.

Until `SKILL_SURVEY_PASSCODE` and `FIREBASE_SERVICE_ACCOUNT` are both set, the page shows a clear "Server not configured" message and nothing can be submitted.

### Bulk skill-matrix import/export (offline, via spreadsheet)

For collecting ratings outside the app entirely (e.g. handing a spreadsheet to team leads), two local scripts round-trip the `skills` collection through a CSV (opens directly in Excel). Both need the same service account key as above; run them from your machine, not deployed anywhere.

```bash
# 1. Export every employee (name + UUID) with every catalog topic as a column,
#    pre-filled with any levels already recorded.
node scripts/exportSkillMatrixTemplate.js /path/to/serviceAccountKey.json

# 2. Have people fill in a level (1-5) per topic that applies to them, leaving
#    the rest blank. Don't touch the Employee Name/UUID columns or the headers.

# 3. Dry run first — validates the file and shows what would change, writes nothing:
node scripts/importSkillMatrix.js /path/to/serviceAccountKey.json /path/to/filled.csv

# 4. Then actually write it:
node scripts/importSkillMatrix.js /path/to/serviceAccountKey.json /path/to/filled.csv --confirm
```

Import upserts by `(employeeId, skill name)` — the same rule the public Skill Survey uses — so re-running the same file updates existing levels rather than duplicating rows. Rows with an unrecognized UUID, or cells with a value outside 1–5, are skipped with a warning rather than failing the whole import.

### Who has completed the Skill Survey?

Every skill rating is tagged with where it came from (`updatedByRole`): `'self-survey'` for the public survey, `'bulk-import'` for the script above, `'admin'`/`'employee'` for edits made directly in the app. That makes "who's actually filled in the survey" a precise, unambiguous question — not just "who has any skills recorded at all" (which would also count people whose data only came from a bulk import or an admin entering it for them).

```bash
node scripts/skillSurveyStatus.js /path/to/serviceAccountKey.json
```

Read-only — prints two lists (completed, with skill count and last-submitted date; and not-yet-completed, with email so you can follow up) and writes a full CSV alongside them.

## Data model (Firestore)

- `users/{uid}` — `name, email, role ('admin'|'employee'), department, managerUid, managerName, dateOfJoining, birthday, status, leaveEntitlements, leaveOpeningTaken, leaveCarryOver`. `managerUid` links an employee to their manager's admin account: the admin dashboard and Resource Analysis show only that admin's reportees; employees with no manager sit in a claimable "Unassigned" list. (UI-level scoping — not enforced in rules.)
- `resourceAnalysis/{employeeId}` — `note, sentiment ('positive'|'neutral'|'concern'), updatedByUid, updatedAt` — a manager's **private** per-employee remark. **Admin-only in rules** (employees can never read their manager's assessment). Feeds the automatic happiness/risk row colour in Resource Analysis, alongside grievances, performance, recognitions and 1:1/feedback recency. `birthday` is stored as `'MM-DD'` only — the year of birth is never collected. Shown as "23 Jul" in profile headers (replacing the joined date), as 🎂 pills on the calendar, as a reminder tag on the admin roster from the day before through the birthday, and as a wishes banner on the employee's Overview on the day.
- `performance/{id}` — `employeeId, date, entryType ('Review'|'Achievement')`, plus:
  - `Review` (admin-authored) — `reviewPeriod, rating (1-5), reviewer, comments, goals`
  - `Achievement` (self-logged by the employee) — `title, description`
- `grievances/{id}` — `employeeId, dateRaised, category, description, status ('Open'|'In Progress'|'Resolved'), priority ('Low'|'Medium'|'High'), assignee, resolutionDate, resolvedBy`, plus a `comments/{id}` subcollection (`authorUid, authorName, authorRole, text, createdAt`). Target resolution date is derived from priority (High 7d · Medium 14d · Low 30d) from the date raised and surfaced as an SLA badge (On Track / Due Soon / Overdue).
- `recognitions/{id}` — `employeeId` (recipient), `recipientName, date, type, description, givenBy, givenByUid, source ('admin'|'peer'), sharedPublicly`
- `feedback/{id}` — `employeeId, date, type ('1:1'|'Peer'|'360'|'Skip-level'), givenBy, summary, actionItems, followUpDate`
- `leaves/{id}` — `employeeId, leaveType, dateFrom, dateTo, numDays, halfDay, status ('Pending'|'Approved'|'Rejected'), approvedBy`. `numDays` counts **working days** (weekends and public holidays excluded); a single-day request may be a `halfDay` (0.5).
- `holidays/{id}` — `date ('YYYY-MM-DD'), name` — company public-holiday calendar. Admin-maintained on the Calendar page; highlighted on the calendar and excluded from leave-day counts.
- `goals/{id}` — `employeeId, objective, description, status ('Not Started'|'In Progress'|'At Risk'|'Completed'), dueDate, progress (0-100), keyResults [{ text, done }], ownerName, createdByUid, createdByRole, createdAt` — collaborative OKRs; both the employee and admin can edit and tick key results. Progress is derived from key results when present, else the manual `progress` value.
- `skills/{id}` — `employeeId, name, category ('Professional Skills'|'Tools/Technologies'|'Domain Knowledge'|'Soft Skill'), level (1-5), updatedByUid, updatedByRole, createdAt, updatedAt` — the **Skill Matrix**; collaborative (employee + admin can add/rate/remove), interactive 1–5 expertise pips grouped by category. Shown as a tab on the employee detail page, in the employee's own workspace, in the admin **Team Skills** finder/gap-analysis page, and populated by the public **Skill Survey** (`updatedByRole: 'self-survey'`; see §9).
- `bookmarks/{id}` — `title, url, category, description, createdAt` — admin-curated useful links shown to the whole team on the **Links** page
- `oneOnOnes/{id}` — `employeeId, date, title, agenda, createdBy, createdAt`; with subcollections `notes/{id}` (`authorUid, authorName, text, createdAt`) and `actions/{id}` (`text, done, createdByUid, createdAt`)

Leave balance per type = `leaveEntitlements[type] − leaveOpeningTaken[type] − sum(numDays of Approved leaves of that type)`. Computed client-side, not stored.

`leaveOpeningTaken` covers **mid-year adoption**: leave someone already used before the team started using Cadence, which has no corresponding `leaves` record. It's kept separate from `leaveEntitlements` so the entitlement stays truthful (12 days/year is still 12 even if 4 are already gone) and so it can be reset to 0 at the start of a new year without having to remember everyone's original allowance. Admin edits both via **Leave tab → Edit entitlements** on an employee's detail page. Employees cannot write either field (enforced in `firestore.rules`) — otherwise they could zero out their own used leave.

## Features

- **Performance & Achievements** — admin logs formal reviews (rating, reviewer, comments, goals); employees can log their own achievements (title, description, no rating) on the same timeline, visually tagged apart from reviews. Achievements never count toward the "Low Performance" / "No Data" attention flags — those only look at admin-authored reviews.
- **Recognitions** — admin can recognize any employee. Any employee can also give a peer a "Spot Award", "Peer Shoutout", or "Great Teamwork" recognition from their own dashboard (pick a teammate, can't recognize yourself). Employees see both what they've received and what they've given.
- **Grievances** — employees raise (start `Open`); admin sets priority, assignee and status. A target resolution date is derived from priority and shown as an SLA badge (On Track / Due Soon / Overdue). Both sides can post to a per-grievance comment thread.
- **Goals / OKRs** — collaborative objectives with key results and a progress bar, editable by both the employee and admin (My Dashboard / the Goals tab on the employee detail page).
- **1:1 meetings** — shared agenda, author-tagged notes and checkable action items per meeting.
- **PTO calendar** — month grid of the team's approved (and optionally pending) leave, colour-coded per person.
- **Analytics** (admin) — team-wide charts at `/analytics`: grievance-status donut, review-rating distribution, headcount by department, recognitions over the last 6 months, 1:1s completed vs open, goals by status, and leave taken vs entitlement. Dependency-free inline SVG/CSS charts.
- **Useful Links** — admin-curated bookmarks shown to the whole team at `/links`.
- **Leave** — employees request (start `Pending`), admin approves/rejects; balances computed client-side.

## Roles & access

- **Admin**: full read/write on all employees' records, creates accounts, logs performance reviews/admin recognitions/feedback, approves/rejects leave and grievances.
- **Employee**: read-only on admin-authored performance reviews and feedback; can log their own achievements; can give peer recognitions to (and see recognitions from) teammates; can create grievances (start `Open`) and leave requests (start `Pending`); cannot approve their own requests or edit anyone else's entries.

Enforced by [`firestore.rules`](./firestore.rules) using a `get()` lookup on `users/{uid}.role` — no custom claims needed at this scale.

## Design

Two brand colors, defined in `tailwind.config.js`:

- **`brand`** — green `#00965E`. The primary action color: buttons, active nav state, key stats, links.
- **`accent`** — violet `#6B3FA0`. A secondary voice used sparingly: section headers and badges (achievement tags, peer-recognition tags).

Backgrounds stay neutral (white / light grey / near-black) so two saturated colors don't compete for attention. The login page pairs them over a dark waveform backdrop (`src/assets/cadence-login-background.svg`) with slow-drifting ambient glows; interior pages carry a very faint (7%) green/purple radial wash so the app feels of a piece with it.

The palette originally took inspiration from the BNP Paribas Fortis green and an Expleo-family violet. No logos or trademarked assets are reproduced — only the color values informed the choice.

## Notes

- Admin account creation uses a secondary, separately-named Firebase App instance for `createUserWithEmailAndPassword` so the admin's own session is never disturbed (see `src/firebase.js` → `getSecondaryAuth()` and `src/components/AddEmployeeModal.jsx`).
- Dashboard aggregation (attention flags, stats) is computed client-side by pulling each collection once and grouping in memory — fine at ~30 employees, no server-side code needed.
