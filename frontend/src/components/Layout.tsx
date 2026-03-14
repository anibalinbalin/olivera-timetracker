import { Outlet, NavLink } from 'react-router-dom'
import { Home01Icon, FolderOpenIcon, Settings01Icon } from 'hugeicons-react'

const navItems = [
  { to: '/', icon: Home01Icon, label: 'Dashboard' },
  { to: '/matters', icon: FolderOpenIcon, label: 'Asuntos' },
  { to: '/settings', icon: Settings01Icon, label: 'Configuración' },
]

export function Layout() {
  return (
    <div className="flex h-dvh">
      <nav className="w-[200px] flex flex-col shrink-0" style={{ backgroundColor: 'var(--navy)' }}>
        {/* Logo */}
        <div className="px-5 pt-6 pb-8">
          <div className="text-white font-bold tracking-[0.05em] text-base uppercase">OLIVERA</div>
          <div className="text-white/50 text-xs font-normal mt-0.5">TimeTracker</div>
        </div>
        {/* Nav */}
        <div className="flex flex-col gap-0.5 px-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:outline-none ${
                  isActive
                    ? 'text-white border-l-[3px] border-[var(--gold)]'
                    : 'text-white/50 hover:text-white/80 border-l-[3px] border-transparent'
                }`
              }
              style={({ isActive }) => isActive ? { backgroundColor: 'var(--navy-light)' } : {}}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="flex-1 overflow-auto" style={{ backgroundColor: 'var(--warm-white)' }}>
        <Outlet />
      </main>
    </div>
  )
}
