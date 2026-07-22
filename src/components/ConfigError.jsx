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
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-lg card p-8">
        <h1 className="text-lg font-semibold text-ink">Firebase isn't configured yet</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Cadence needs your Firebase project's credentials before it can start. Copy{' '}
          <code className="rounded bg-white/10 px-1 py-0.5">.env.example</code> to{' '}
          <code className="rounded bg-white/10 px-1 py-0.5">.env.local</code> and fill in these
          values, then restart the dev server:
        </p>
        <ul className="mt-3 space-y-1 rounded-md bg-white/10 p-3 font-mono text-xs text-ink-muted">
          {REQUIRED_VARS.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-faint">See README.md for where to find these in the Firebase console.</p>
      </div>
    </div>
  )
}
