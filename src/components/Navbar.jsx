import { useEffect, useState } from 'react'
import { Search, Menu, Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Avatar from './Avatar'
import { api } from '../api'
import { useAuth } from '../auth'

export default function Navbar({ search, setSearch, onMenuClick }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    api.getNotifications().then((n) => setUnread(n.filter((x) => !x.read).length)).catch(() => {})
  }, [])

  return (
    <header className="sticky top-0 z-30 bg-paper/90 backdrop-blur-sm border-b-[1.5px] border-ink">
      <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center gap-3 md:gap-6">
        <button onClick={onMenuClick} className="md:hidden p-1.5" aria-label="Open menu">
          <Menu size={22} />
        </button>

        <button onClick={() => navigate('/')} className="shrink-0 text-left">
          <div className="font-display font-extrabold text-lg leading-none">
            campus<span className="text-tape-coral">market</span>
          </div>
          <svg width="90" height="7" className="mt-0.5">
            <path d="M2 3.5 Q 22 -0.5 45 3.5 T 88 3.5" stroke="#FFD24D" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex-1 max-w-md relative hidden sm:block">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search textbooks, cycles, notes..."
            className="w-full bg-white border-[1.5px] border-ink rounded-md pl-9 pr-3 py-2 text-sm placeholder:text-ink-soft/70 focus:outline-none focus:ring-2 focus:ring-tape-yellow"
          />
        </div>

        <div className="flex-1" />

        <button onClick={() => navigate('/notifications')} className="relative p-1.5" aria-label="Notifications">
          <Bell size={18} />
          {unread > 0 && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-tape-coral" />}
        </button>
        <button onClick={() => navigate('/profile')} className="shrink-0">
          <Avatar emoji={user?.avatar || '🦊'} size="sm" rotate={-4} />
        </button>
      </div>
    </header>
  )
}
