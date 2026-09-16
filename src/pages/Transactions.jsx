import { useEffect, useState } from 'react'
import { Receipt, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'

const TABS = ['all', 'borrowed', 'lent', 'due', 'overdue']

export default function Transactions() {
  const { user } = useAuth()
  const [txns, setTxns] = useState([])
  const [tab, setTab] = useState('all')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = () => {
    api.getTransactions().then(setTxns).catch(() => setTxns([])).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const filtered = txns.filter((t) => {
    if (tab === 'borrowed') return String(t.borrowerId) === String(user?.id || user?._id)
    if (tab === 'lent') return String(t.lenderId) === String(user?.id || user?._id)
    if (tab === 'due') return t.status === 'DUE_SOON'
    if (tab === 'overdue') return t.status === 'OVERDUE' || t.overdueStatus
    return true
  })

  const act = async (fn, ok) => {
    try {
      await fn()
      setMsg(ok)
      load()
    } catch (err) {
      setMsg(err.message)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
      <h1 className="font-display font-bold text-2xl mb-1">Loans & payments</h1>
      <p className="text-sm text-ink-soft mb-4">Borrowed / lent items, due dates, and sale payments</p>
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`text-xs px-3 py-1.5 rounded-full border ${tab === t ? 'bg-ink text-paper border-ink' : 'bg-white border-ink/25'}`}>{t}</button>
        ))}
      </div>
      {msg && <p className="text-xs text-moss-ink mb-3">{msg}</p>}
      {loading ? <p className="text-sm text-ink-soft">Loading transactions...</p> : (
        <div className="bg-paper-card border-[1.5px] border-ink rounded-md divide-y divide-line overflow-hidden">
          {filtered.map((t) => {
            const uid = String(user?.id || user?._id)
            const isLender = String(t.lenderId) === uid
            const isBorrower = String(t.borrowerId) === uid
            return (
              <div key={t.id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${t.type === 'bought' || t.type === 'borrowed' ? 'bg-coral-bg' : 'bg-moss-bg'}`}>
                    {t.type === 'bought' || t.type === 'borrowed' ? <ArrowDownLeft size={16} className="text-coral-ink" /> : <ArrowUpRight size={16} className="text-moss-ink" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.item}</p>
                    <p className="text-xs text-ink-soft">{t.status} · {t.remainingLabel || t.date} · ₹{t.amount}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {isLender && t.status === 'REQUESTED' && (
                    <>
                      <button onClick={() => act(() => api.approveTransaction(t.id), 'Approved')} className="text-xs border-[1.5px] border-ink rounded-full px-3 py-1">Approve</button>
                      <button onClick={() => act(() => api.rejectTransaction(t.id), 'Rejected')} className="text-xs text-ink-soft">Reject</button>
                    </>
                  )}
                  {isBorrower && ['ACTIVE', 'DUE_SOON', 'OVERDUE'].includes(t.status) && (
                    <>
                      <button onClick={() => act(() => api.returnTransaction(t.id), 'Return requested')} className="text-xs border-[1.5px] border-ink rounded-full px-3 py-1">Mark returned</button>
                      <button onClick={() => act(() => api.extendTransaction(t.id, { days: 3 }), 'Extension requested')} className="text-xs border-[1.5px] border-ink rounded-full px-3 py-1">Request +3 days</button>
                    </>
                  )}
                  {isLender && t.status === 'RETURN_REQUESTED' && (
                    <button onClick={() => act(() => api.returnTransaction(t.id), 'Return confirmed')} className="text-xs bg-ink text-paper rounded-full px-3 py-1">Confirm return</button>
                  )}
                  {isLender && t.extensionHistory?.some((e) => e.status === 'pending') && (
                    <button onClick={() => act(() => api.extendTransaction(t.id, { approve: true }), 'Extension approved')} className="text-xs border-[1.5px] border-ink rounded-full px-3 py-1">Approve extension</button>
                  )}
                  {(isBorrower || isLender) && ['ACTIVE', 'DUE_SOON', 'OVERDUE', 'REQUESTED'].includes(t.status) && (
                    <button
                      onClick={() => act(() => api.agreeMeeting(t.id, { meetingPoint: 'Library steps (approx. campus meet-up)' }), 'Meeting agreement recorded')}
                      className="text-xs border-[1.5px] border-ink rounded-full px-3 py-1"
                    >
                      Agree campus meet-up
                    </button>
                  )}
                  {t.meetingPoint && (
                    <p className="text-[11px] text-ink-soft w-full">Agreed meeting: {t.meetingPoint}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex flex-col items-center text-center text-ink-soft mt-10">
        <Receipt size={28} className="mb-2" />
        <p className="text-sm">A loan is completed only after the lender confirms return.</p>
      </div>
    </div>
  )
}
