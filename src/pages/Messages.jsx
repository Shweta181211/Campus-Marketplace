import { useEffect, useState } from 'react'
import { MessageCircle, ArrowLeft, Send } from 'lucide-react'
import { api } from '../api'

export default function Messages() {
  const [threads, setThreads] = useState([])
  const [active, setActive] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadThreads = () =>
    api.getMessages().then(setThreads).catch((err) => setError(err.message))

  useEffect(() => {
    loadThreads().finally(() => setLoading(false))
  }, [])

  const openThread = async (t) => {
    setActive(t)
    setError('')
    try {
      const rows = await api.getConversation(t.conversationId || t.id)
      setMessages(rows)
    } catch (err) {
      setError(err.message)
    }
  }

  const send = async (e) => {
    e.preventDefault()
    if (!draft.trim() || !active) return
    try {
      await api.createMessage({
        conversationId: active.conversationId || active.id,
        toUserId: active.toUserId || active.fromUserId,
        listingId: active.listingId,
        body: draft,
        preview: draft,
        item: active.item,
      })
      setDraft('')
      await openThread(active)
      await loadThreads()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
      <h1 className="font-display font-bold text-2xl mb-1">Messages</h1>
      <p className="text-sm text-ink-soft mb-6">Chats with buyers, sellers and borrowers on campus</p>
      {error && <p className="text-sm text-coral-ink mb-3">{error}</p>}

      {active ? (
        <div>
          <button onClick={() => setActive(null)} className="flex items-center gap-1 text-sm text-ink-soft mb-3">
            <ArrowLeft size={14} /> Back to threads
          </button>
          <div className="bg-paper-card border-[1.5px] border-ink rounded-md p-4 min-h-64 space-y-2">
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-medium">{m.name}: </span>
                <span className="text-ink-soft">{m.body || m.preview}</span>
              </div>
            ))}
          </div>
          <form onSubmit={send} className="flex gap-2 mt-3">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1 bg-white border-[1.5px] border-ink rounded-md px-3 py-2 text-sm" placeholder="Write a message" />
            <button className="bg-ink text-paper rounded-full px-4 py-2 text-sm inline-flex items-center gap-1"><Send size={14} /> Send</button>
          </form>
        </div>
      ) : loading ? (
        <p className="text-sm text-ink-soft">Loading messages...</p>
      ) : (
        <div className="bg-paper-card border-[1.5px] border-ink rounded-md divide-y divide-line overflow-hidden">
          {threads.map((t) => (
            <button key={t.id || t.name} onClick={() => openThread(t)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-white transition-colors">
              <div className="w-10 h-10 rounded-md bg-white border-[1.5px] border-ink flex items-center justify-center text-lg shrink-0">{t.avatar}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{t.name}</p>
                  <span className="text-[11px] text-ink-soft">{t.time}</span>
                </div>
                <p className="text-xs text-ink-soft truncate">{t.preview}</p>
                <p className="text-[10.5px] text-ink-soft/70 mt-0.5">re: {t.item}</p>
              </div>
              {t.unread && <span className="w-2 h-2 rounded-full bg-tape-coral shrink-0" />}
            </button>
          ))}
          {threads.length === 0 && (
            <div className="p-6 text-center text-ink-soft text-sm flex flex-col items-center">
              <MessageCircle size={28} className="mb-2" />
              No conversations yet.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
