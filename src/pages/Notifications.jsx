import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { api } from '../api'

export default function Notifications() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    api.getNotifications().then(setItems).catch(() => setItems([])).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const mark = async (id) => {
    await api.readNotification(id)
    setItems((rows) => rows.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center gap-2 mb-1">
        <Bell size={18} />
        <h1 className="font-display font-bold text-2xl">Notifications</h1>
      </div>
      <p className="text-sm text-ink-soft mb-6">Due dates, borrow requests, payments and review updates</p>
      {loading ? <p className="text-sm text-ink-soft">Loading…</p> : (
        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-ink-soft">No notifications yet.</p>}
          {items.map((n) => (
            <button key={n.id} onClick={() => mark(n.id)} className={`w-full text-left bg-paper-card border-[1.5px] border-ink rounded-md p-3.5 ${n.read ? 'opacity-70' : ''}`}>
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-ink-soft mt-0.5">{n.body}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
