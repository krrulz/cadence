import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// getAuth() throws synchronously if the API key is missing/invalid, which would
// otherwise crash the whole React tree before anything can render. Guard it so a
// missing .env.local shows a helpful message (see main.jsx) instead of a blank page.
export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean)

// Primary app: used for the signed-in admin/employee session throughout the app.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = firebaseConfigured ? getAuth(app) : null
export const db = firebaseConfigured ? getFirestore(app) : null

// Secondary, separately-named app instance used ONLY for admin-driven employee
// account creation. Calling createUserWithEmailAndPassword on the primary auth
// instance would sign the admin out and into the new employee account, so we
// isolate that call on its own app/auth instance and sign out of it immediately
// after, leaving the admin's primary session untouched.
const SECONDARY_APP_NAME = 'employee-creation'
export function getSecondaryAuth() {
  const secondaryApp = getApps().some((a) => a.name === SECONDARY_APP_NAME)
    ? getApp(SECONDARY_APP_NAME)
    : initializeApp(firebaseConfig, SECONDARY_APP_NAME)
  return getAuth(secondaryApp)
}
