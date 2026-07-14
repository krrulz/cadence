import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function Layout({ children }) {
  const { profile, isAdmin, logout } = useAuth()

  return (
    <div className="min-h-screen bg-slate-50 bg-[radial-gradient(circle_at_top_left,rgba(0,150,94,0.07),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(107,63,160,0.07),transparent_40%)] bg-fixed">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to={isAdmin ? '/' : '/me'} className="shrink-0 text-lg font-semibold tracking-tight">
            Cadence
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-4">
            <span className="hidden min-w-0 truncate text-slate-200 sm:inline">
              {profile?.name} <span className="text-slate-400">· {profile?.role}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="shrink-0 rounded-md bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
