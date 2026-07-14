const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]

export default function ConfigError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Firebase isn't configured yet</h1>
        <p className="mt-2 text-sm text-slate-600">
          Cadence needs your Firebase project's credentials before it can start. Copy{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">.env.example</code> to{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5">.env.local</code> and fill in these
          values, then restart the dev server:
        </p>
        <ul className="mt-3 space-y-1 rounded-md bg-slate-100 p-3 font-mono text-xs text-slate-700">
          {REQUIRED_VARS.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-500">See README.md for where to find these in the Firebase console.</p>
      </div>
    </div>
  )
}
