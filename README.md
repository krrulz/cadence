# Cadence

A Firebase-backed replacement for a spreadsheet-based people-management tracker. Employees sign in and see only their own records; the admin sees and manages everyone's.

Built with Vite + React + Tailwind, Firebase Authentication (email/password) and Firestore, deployed as a static app on Vercel.

## Tech stack

- Vite + React (JS)
- Tailwind CSS
- react-router-dom
- Firebase Authentication (email/password, no self-signup)
- Firestore (Spark/free plan)
- Vercel (static hosting + one serverless function for the optional AI email feature)
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

1. **Cloudflare account ID**: [dash.cloudflare.com](https://dash.cloudflare.com/) → any domain → the Account ID is in the right sidebar. (Or Workers & Pages → Overview.)
2. **API token**: Cloudflare dashboard → My Profile → API Tokens → Create Token → use the **Workers AI** template (or a custom token with `Account → Workers AI → Read`). Copy it — it's shown once.
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

## Data model (Firestore)

- `users/{uid}` — `name, email, role ('admin'|'employee'), department, managerName, dateOfJoining, status, leaveEntitlements, leaveOpeningTaken`
- `performance/{id}` — `employeeId, date, entryType ('Review'|'Achievement')`, plus:
  - `Review` (admin-authored) — `reviewPeriod, rating (1-5), reviewer, comments, goals`
  - `Achievement` (self-logged by the employee) — `title, description`
- `grievances/{id}` — `employeeId, dateRaised, category, description, status ('Open'|'In Progress'|'Resolved'), resolutionDate, resolvedBy`
- `recognitions/{id}` — `employeeId` (recipient), `recipientName, date, type, description, givenBy, givenByUid, source ('admin'|'peer'), sharedPublicly`
- `feedback/{id}` — `employeeId, date, type ('1:1'|'Peer'|'360'|'Skip-level'), givenBy, summary, actionItems, followUpDate`
- `leaves/{id}` — `employeeId, leaveType, dateFrom, dateTo, numDays, status ('Pending'|'Approved'|'Rejected'), approvedBy`

Leave balance per type = `leaveEntitlements[type] − leaveOpeningTaken[type] − sum(numDays of Approved leaves of that type)`. Computed client-side, not stored.

`leaveOpeningTaken` covers **mid-year adoption**: leave someone already used before the team started using Cadence, which has no corresponding `leaves` record. It's kept separate from `leaveEntitlements` so the entitlement stays truthful (12 days/year is still 12 even if 4 are already gone) and so it can be reset to 0 at the start of a new year without having to remember everyone's original allowance. Admin edits both via **Leave tab → Edit entitlements** on an employee's detail page. Employees cannot write either field (enforced in `firestore.rules`) — otherwise they could zero out their own used leave.

## Features

- **Performance & Achievements** — admin logs formal reviews (rating, reviewer, comments, goals); employees can log their own achievements (title, description, no rating) on the same timeline, visually tagged apart from reviews. Achievements never count toward the "Low Performance" / "No Data" attention flags — those only look at admin-authored reviews.
- **Recognitions** — admin can recognize any employee. Any employee can also give a peer a "Spot Award", "Peer Shoutout", or "Great Teamwork" recognition from their own dashboard (pick a teammate, can't recognize yourself). Employees see both what they've received and what they've given.
- **Grievances & leave** — unchanged from the original spec: employees raise/request, admin approves/resolves.

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
