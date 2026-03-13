import { Outlet, NavLink } from 'react-router-dom'
import { Calendar01Icon, CheckmarkBadge01Icon, FolderOpenIcon, FileExportIcon, Settings01Icon } from 'hugeicons-react'

const navItems = [
  { to: '/', icon: Calendar01Icon, label: 'Today' },
  { to: '/review', icon: CheckmarkBadge01Icon, label: 'Review' },
  { to: '/matters', icon: FolderOpenIcon, label: 'Matters' },
  { to: '/export', icon: FileExportIcon, label: 'Export' },
  { to: '/settings', icon: Settings01Icon, label: 'Settings' },
]

export function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <nav className="w-56 bg-white border-r border-gray-200 p-4 flex flex-col gap-1">
        <h1 className="text-lg font-bold px-3 py-2 mb-4">TimeTracker</h1>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
