import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { LayoutGrid, BarChart3, CalendarDays, Link2, KeyRound, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'
import ChangePasswordModal from './ChangePasswordModal.jsx'
import Avatar from './Avatar.jsx'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutGrid, adminOnly: true, end: true },
  { to: '/me', label: 'My Dashboard', icon: LayoutGrid, employeeOnly: true, end: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, adminOnly: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/links', label: 'Links', icon: Link2 },
]

export default function Layout({ children }) {
  const { profile, isAdmin, logout } = useAuth()
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const links = NAV.filter((l) => {
    if (l.adminOnly) return isAdmin
    if (l.employeeOnly) return !isAdmin
    return true
  })

  const navList = (
    <nav className="flex flex-col gap-1">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border border-mint/35 bg-gradient-to-r from-mint/20 to-mint-deep/10 text-white'
                : 'text-ink-muted hover:bg-white/5 hover:text-ink'
            }`
          }
        >
          <l.icon size={18} />
          <span>{l.label}</span>
        </NavLink>
      ))}
    </nav>
  )

  const accountActions = (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => {
          setShowChangePassword(true)
          setMenuOpen(false)
        }}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
      >
        <KeyRound size={18} /> Password
      </button>
      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
      >
        <LogOut size={18} /> Sign out
      </button>
    </div>
  )

  const brand = (
    <Link to={isAdmin ? '/' : '/me'} className="flex items-center gap-2.5" onClick={() => setMenuOpen(false)}>
      <span
        className="grid h-9 w-9 place-items-center rounded-xl text-base font-extrabold text-surface"
        style={{ background: 'linear-gradient(135deg,#00E28E,#7C5CFF)', boxShadow: '0 6px 18px -6px rgba(124,92,255,.7)' }}
      >
        C
      </span>
      <span className="text-lg font-bold tracking-tight text-ink">Cadence</span>
    </Link>
  )

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[236px_1fr]">
      {/* Desktop sidebar */}
      <aside className="glass sticky top-0 hidden h-screen flex-col gap-6 border-b-0 border-l-0 border-t-0 p-4 lg:flex">
        <div className="px-2 pt-2">{brand}</div>
        <div className="flex-1">{navList}</div>
        <div className="border-t border-surface-border pt-3">
          {accountActions}
          <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-surface-border bg-white/[0.04] p-2.5">
            <Avatar name={profile?.name} colorKey={profile?.id} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink">{profile?.name}</span>
              <span className="block text-xs text-ink-faint">{profile?.role}</span>
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-30 flex items-center justify-between px-4 py-3 lg:hidden">
        {brand}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-lg border border-surface-border p-2 text-ink"
          aria-label="Menu"
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      {menuOpen && (
        <div className="glass sticky top-[57px] z-20 space-y-3 px-4 py-4 lg:hidden">
          {navList}
          <div className="border-t border-surface-border pt-3">{accountActions}</div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">{children}</main>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  )
}
