import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import loginBackground from '../assets/cadence-login-background.svg'

export default function Login() {
  const { user, profile, loading, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Once auth + profile resolve, route by role. This guard (not a manual
  // navigate) handles the post-login redirect, so employees land on /me
  // instead of bouncing through the admin-only '/'.
  if (!loading && user && profile) {
    return <Navigate to={profile.role === 'admin' ? '/' : '/me'} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      // No manual navigate — the role-aware guard above redirects once the
      // profile loads.
    } catch (err) {
      setError('Invalid email or password.')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B1523] bg-cover bg-center px-4 py-12"
      style={{ backgroundImage: `url(${loginBackground})` }}
    >
      {/* Ambient floating glows — purely decorative, echo the waveform art */}
      <div
        className="animate-floaty pointer-events-none absolute -left-16 top-[12%] h-72 w-72 rounded-full bg-brand/25 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="animate-floaty-slow pointer-events-none absolute -right-20 bottom-[8%] h-80 w-80 rounded-full bg-accent/25 blur-3xl"
        style={{ animationDelay: '1.5s' }}
        aria-hidden="true"
      />
      <div
        className="animate-floaty pointer-events-none absolute right-[18%] top-[8%] h-40 w-40 rounded-full bg-accent/20 blur-2xl"
        style={{ animationDelay: '3s' }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm">
        <div className="animate-fade-in-up mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Cadence</h1>
          <p className="mt-1 text-sm text-white/70">Your team, in rhythm.</p>
        </div>

        <div className="relative">
          <div className="animate-glow-pulse pointer-events-none absolute -inset-1 rounded-2xl bg-gradient-to-br from-brand/40 via-accent/30 to-brand/40 blur-lg" />
          <div
            className="animate-fade-in-up relative rounded-xl border border-white/10 bg-white/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8"
            style={{ animationDelay: '0.12s' }}
          >
            <p className="text-center text-sm font-medium text-slate-500">Sign in to continue</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-base transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative mt-1">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2.5 pr-16 text-base transition-colors focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-xs font-medium text-slate-500 hover:text-brand"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-lg disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
