import { NavLink } from 'react-router-dom'
import { Home, ShoppingBag, PackagePlus, ListChecks, MessageCircle, Receipt, User, ShieldAlert, X, Bell } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/buy-borrow', label: 'Buy / Borrow', icon: ShoppingBag },
  { to: '/sell-lend', label: 'Sell / Lend', icon: PackagePlus },
  { to: '/my-listings', label: 'My listings', icon: ListChecks },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/transactions', label: 'Loans & payments', icon: Receipt },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile', label: 'Profile', icon: User },
]

export default function Sidebar({ open, onClose, user }) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-ink/30 z-40 md:hidden" onClick={onClose} />
      )}
      <aside className={`
        fixed md:sticky top-0 md:top-16 left-0 h-screen md:h-[calc(100vh-4rem)] w-60 bg-paper-card md:bg-transparent
        border-r-[1.5px] border-ink md:border-r-0 z-50 md:z-0 transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      `}>
        <div className="flex items-center justify-between p-4 md:hidden border-b border-line">
          <span className="font-display font-bold">Menu</span>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <nav className="p-3 md:p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors
                ${isActive ? 'bg-ink text-paper' : 'text-ink hover:bg-white border border-transparent hover:border-ink/15'}
              `}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <div className="pt-3 mt-3 border-t border-line">
              <NavLink
                to="/admin"
                onClick={onClose}
                className={({ isActive }) => `
                  flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors
                  ${isActive ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-white border border-transparent hover:border-ink/15'}
                `}
              >
                <ShieldAlert size={17} />
                Admin fraud review
              </NavLink>
            </div>
          )}
        </nav>
      </aside>
    </>
  )
}
