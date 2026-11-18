import { useEffect, useState } from 'react'
import { ShieldAlert, Flag, Users, BarChart3, Settings2, Brain, ScrollText } from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../auth'
import Avatar from '../components/Avatar'

const riskStyles = {
  LOW: 'bg-moss-bg text-moss-ink border-moss-ink/30',
  MEDIUM: 'bg-yellow-bg text-yellow-ink border-yellow-ink/30',
  HIGH: 'bg-coral-bg text-coral-ink border-coral-ink/30',
}
const norm = (r) => String(r || 'MEDIUM').toUpperCase()

const TABS = [
  ['fraud', 'Fraud alerts', ShieldAlert],
  ['reports', 'Reports', Flag],
  ['users', 'Users', Users],
  ['analytics', 'Analytics', BarChart3],
  ['settings', 'Settings', Settings2],
  ['model', 'AI models', Brain],
  ['audit', 'Audit log', ScrollText],
]

const card = 'bg-paper-card border-[1.5px] border-ink rounded-md p-4'
const btn = 'text-xs font-medium border-[1.5px] border-ink rounded-full px-3.5 py-1.5 hover:bg-white disabled:opacity-50'

export default function AdminModeration() {
  const { user } = useAuth()
  const [tab, setTab] = useState('fraud')

  if (user?.role !== 'admin') {
    return <div className="max-w-3xl mx-auto px-4 py-8 text-sm text-coral-ink">Admin only. Students cannot access the admin console.</div>
  }

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center gap-2 mb-1">
        <ShieldAlert size={20} />
        <h1 className="font-display font-bold text-2xl">Admin console</h1>
      </div>
      <p className="text-sm text-ink-soft mb-5">
        The AI flags; people decide. Nothing here auto-accuses a student — every action is written to the audit log.
      </p>
      <div className="flex flex-wrap gap-1.5 mb-6">
        {TABS.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border-[1.5px] ${tab === id ? 'bg-ink text-paper border-ink' : 'bg-white border-ink/30'}`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>
      {tab === 'fraud' && <FraudQueue />}
      {tab === 'reports' && <Reports />}
      {tab === 'users' && <UsersTab />}
      {tab === 'analytics' && <Analytics />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'model' && <ModelTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}

function useLoad(fn, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = () => fn().then(setData).catch((e) => setError(e.message))
  useEffect(() => { load() }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: load, setData }
}

// ───────────────────────── fraud queue ─────────────────────────
function RiskMeter({ score }) {
  const pct = Math.round(Math.min(1, Math.max(0, Number(score || 0))) * 100)
  return (
    <div className="w-40" title={`Fraud risk ${score} (LOW < 0.40 ≤ MEDIUM < 0.70 ≤ HIGH)`}>
      <div className="relative h-2 bg-paper rounded-full border border-ink/15 overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-ink rounded-full" style={{ width: `${pct}%` }} />
        <div className="absolute inset-y-0 w-px bg-ink-soft" style={{ left: '40%' }} />
        <div className="absolute inset-y-0 w-px bg-ink-soft" style={{ left: '70%' }} />
      </div>
      <p className="text-[10.5px] font-mono text-ink-soft mt-0.5">risk {Number(score || 0).toFixed(2)}</p>
    </div>
  )
}

function FraudQueue() {
  const [status, setStatus] = useState('pending')
  const { data: rows, error, reload } = useLoad(() => api.getFraudAlerts(status), [status])
  const [msg, setMsg] = useState('')
  const [notes, setNotes] = useState({})

  const review = async (listingId, decision) => {
    try {
      await api.reviewListingWithNote(listingId, decision, notes[listingId] || '')
      setMsg(`Listing ${decision === 'approve' ? 'approved' : 'removed'}`)
      reload()
    } catch (err) {
      setMsg(err.message)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs">
        <span className="text-ink-soft">Show</span>
        {['pending', 'all'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1 rounded-full border ${status === s ? 'bg-ink text-paper' : 'bg-white border-ink/30'}`}>{s}</button>
        ))}
        <span className="ml-auto text-ink-soft">HIGH = held · MEDIUM = seller must verify by email code</span>
      </div>
      {msg && <p className="text-xs mb-3">{msg}</p>}
      {error && <p className="text-xs text-coral-ink mb-3">{error}</p>}
      {!rows ? <p className="text-sm text-ink-soft">Loading…</p> : rows.length === 0 ? <p className="text-sm text-ink-soft">Queue is empty.</p> : (
        <div className="space-y-3">
          {rows.map((m) => {
            const l = m.listingDoc
            return (
              <div key={m.id} className={card}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{m.listing}</p>
                    <p className="text-xs text-ink-soft mt-0.5">
                      Seller: {m.seller} · source: {m.source || 'ml'} · {new Date(m.createdAt).toLocaleString()}
                    </p>
                    {l && (
                      <p className="text-xs mt-1">
                        Asking <span className="font-mono">₹{l.price}</span>
                        {l.recommendedPrice ? <> · AI fair <span className="font-mono">₹{l.fairMin}–₹{l.fairMax}</span></> : null}
                        {' '}· status <span className="font-mono">{l.status}</span>
                        {l.reportCount ? ` · ${l.reportCount} reports` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-xs font-mono font-medium px-2.5 py-1 rounded-full border ${riskStyles[norm(m.risk)]}`}>{norm(m.risk)} risk</span>
                    <RiskMeter score={m.fraudRiskScore ?? l?.fraudRiskScore} />
                  </div>
                </div>
                {l?.description && <p className="text-xs text-ink-soft mt-2 line-clamp-2">“{l.description}”</p>}
                {(m.reasons?.length > 0 || l?.fraudReasons?.length > 0) && (
                  <div className="mt-2">
                    <p className="text-[11px] font-medium">Why the model flagged it</p>
                    <ul className="text-[11px] text-ink-soft list-disc ml-4">
                      {(m.reasons?.length ? m.reasons : l.fraudReasons).map((r) => (
                        <li key={r.feature}>{r.text} <span className="font-mono">(+{r.impact}, {r.level})</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] mt-1.5">
                  Signals: {(m.signals?.length ? m.signals : l?.fraudSignals || []).map((s) => (
                    <span key={s} className="inline-block font-mono bg-white border border-ink/15 rounded px-1.5 mr-1 mb-1">{s}</span>
                  ))}
                </p>
                {m.listingId && m.status === 'pending' && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <input
                      value={notes[m.listingId] || ''}
                      onChange={(e) => setNotes({ ...notes, [m.listingId]: e.target.value })}
                      placeholder="Note to seller (optional)"
                      className="flex-1 min-w-40 bg-white border border-ink/30 rounded-md px-2 py-1 text-xs"
                    />
                    <button onClick={() => review(m.listingId, 'approve')} className={btn}>Approve</button>
                    <button onClick={() => review(m.listingId, 'reject')} className="text-xs font-medium text-coral-ink px-3.5 py-1.5">Reject / remove</button>
                  </div>
                )}
                {m.status !== 'pending' && <p className="text-[11px] font-mono mt-2">Decision: {m.status}{m.adminNote ? ` — ${m.adminNote}` : ''}</p>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── reports ─────────────────────────
function Reports() {
  const [status, setStatus] = useState('open')
  const { data, error, reload } = useLoad(() => api.adminReports(status), [status])
  const [msg, setMsg] = useState('')

  const decide = async (r, decision, removeListing = false) => {
    const note = window.prompt(`Note for the record (${decision})`, '') ?? ''
    try {
      await api.adminDecideReport(r.id, { status: decision, note, removeListing })
      setMsg(`Report ${decision}`)
      reload()
    } catch (err) {
      setMsg(err.message)
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-3 text-xs">
        {['open', 'confirmed', 'dismissed', 'all'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1 rounded-full border ${status === s ? 'bg-ink text-paper' : 'bg-white border-ink/30'}`}>{s}</button>
        ))}
      </div>
      <p className="text-[11px] text-ink-soft mb-3">Confirmed reports lower the accused student’s trust score much more than open (unverified) ones. 3 open reports on a listing hide it automatically.</p>
      {msg && <p className="text-xs mb-2">{msg}</p>}
      {error && <p className="text-xs text-coral-ink">{error}</p>}
      {!data ? <p className="text-sm text-ink-soft">Loading…</p> : data.length === 0 ? <p className="text-sm text-ink-soft">No reports.</p> : (
        <div className="space-y-3">
          {data.map((r) => (
            <div key={r.id} className={card}>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{r.reason}</p>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {r.targetType} · {r.category?.replace('_', ' ')} · severity {r.severity} · by {r.reporter?.name || 'system'}
                  </p>
                  <p className="text-xs mt-1">
                    Accused: <span className="font-medium">{r.accused?.name}</span>
                    {r.accused && <> · trust {r.accused.trustScore} · confirmed reports {r.accused.confirmedReports || 0}{r.accused.suspended ? ' · SUSPENDED' : ''}</>}
                  </p>
                  {r.listing && <p className="text-xs">Listing: {r.listing.title} (₹{r.listing.price}, {r.listing.status}, risk {r.listing.fraudRiskLevel})</p>}
                  {r.details && <p className="text-[11px] text-ink-soft mt-1">{r.details}</p>}
                </div>
                <span className="text-[11px] font-mono shrink-0">{r.status}</span>
              </div>
              {r.status === 'open' && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button className={btn} onClick={() => decide(r, 'confirmed')}>Confirm</button>
                  {r.listing && <button className={btn} onClick={() => decide(r, 'confirmed', true)}>Confirm + remove listing</button>}
                  <button className="text-xs text-ink-soft px-3" onClick={() => decide(r, 'dismissed')}>Dismiss</button>
                </div>
              )}
              {r.adminNote && <p className="text-[11px] font-mono mt-2">Admin note: {r.adminNote}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── users ─────────────────────────
function UsersTab() {
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const { data, error, reload } = useLoad(() => api.adminUsers(query), [query])
  const [msg, setMsg] = useState('')

  const toggle = async (u) => {
    let reason = ''
    if (!u.suspended) {
      reason = window.prompt(`Suspend ${u.name}? Reason (shown to the student):`, '') || ''
      if (!reason) return
    }
    try {
      const r = await api.adminSuspend(u.id, !u.suspended, reason)
      setMsg(`${u.name} ${r.suspended ? 'suspended' : 'restored'} · ${r.listingsChanged} listing(s) ${r.suspended ? 'hidden' : 'restored'}`)
      reload()
    } catch (err) {
      setMsg(err.message)
    }
  }

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); setQuery(q) }} className="flex gap-2 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="flex-1 bg-white border-[1.5px] border-ink rounded-md px-3 py-1.5 text-sm" />
        <button className={btn}>Search</button>
      </form>
      {msg && <p className="text-xs mb-2">{msg}</p>}
      {error && <p className="text-xs text-coral-ink">{error}</p>}
      {!data ? <p className="text-sm text-ink-soft">Loading…</p> : (
        <div className="bg-paper-card border-[1.5px] border-ink rounded-md divide-y divide-line">
          {data.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3">
              <Avatar emoji={u.avatar} config={u.avatarConfig} size="sm" rotate={0} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.name} {u.role === 'admin' && <span className="text-[10px] font-mono">(admin)</span>}</p>
                <p className="text-[11px] text-ink-soft truncate">{u.email}</p>
                <p className="text-[11px] font-mono text-ink-soft">
                  trust {u.trustScore} · {u.activeListings} listings · {u.openReports} open reports · {u.confirmedReports || 0} confirmed
                  {u.linkedAccounts > 0 && <span className="text-coral-ink"> · {u.linkedAccounts} linked account(s) on same device</span>}
                </p>
                {u.suspended && <p className="text-[11px] text-coral-ink">Suspended: {u.suspendedReason}</p>}
              </div>
              {u.role !== 'admin' && (
                <button onClick={() => toggle(u)} className={u.suspended ? btn : 'text-xs text-coral-ink px-3 py-1.5'}>
                  {u.suspended ? 'Unsuspend' : 'Suspend'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ───────────────────────── analytics ─────────────────────────
function Stat({ label, value, note }) {
  return (
    <div className="bg-white border-[1.5px] border-ink rounded-md p-3">
      <p className="text-[11px] text-ink-soft">{label}</p>
      <p className="font-mono font-semibold text-xl mt-0.5">{value}</p>
      {note && <p className="text-[10.5px] text-ink-soft">{note}</p>}
    </div>
  )
}

function Bars({ title, data }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map(([, v]) => v))
  return (
    <div className="bg-white border-[1.5px] border-ink rounded-md p-3">
      <p className="text-xs font-medium mb-2">{title}</p>
      {entries.length === 0 && <p className="text-[11px] text-ink-soft">No data</p>}
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-[11px] group" title={`${k}: ${v}`}>
            <span className="w-24 truncate text-ink-soft">{k}</span>
            <div className="flex-1 h-2.5 rounded-r-[4px] bg-paper">
              <div className="h-full bg-sky-ink rounded-r-[4px] group-hover:opacity-80" style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right font-mono">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Analytics() {
  const { data, error } = useLoad(() => api.adminAnalytics(), [])
  if (error) return <p className="text-xs text-coral-ink">{error}</p>
  if (!data) return <p className="text-sm text-ink-soft">Loading…</p>
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Students" value={data.users.total} note={`${data.users.verified} verified · ${data.users.suspended} suspended`} />
        <Stat label="Avg. trust score" value={data.users.avgTrustScore} />
        <Stat label="Awaiting review" value={data.moderation.pendingReview} note={`${data.moderation.openReports} open reports`} />
        <Stat label="Paid orders" value={data.payments.paidCount} note={`₹${Math.round(data.payments.paidTotal)} total`} />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Bars title="Listings by status" data={data.listings.byStatus} />
        <Bars title="Listings by fraud risk level" data={data.listings.byFraudLevel} />
        <Bars title="Active listings by category" data={data.listings.byCategory} />
        <Bars title="New listings, last 7 days" data={data.listings.newPerDay} />
        <Bars title="Transactions by status" data={data.transactions.byStatus} />
      </div>
      <div className={card}>
        <p className="text-sm font-medium mb-2">Overdue loans ({data.transactions.overdueCount})</p>
        {data.overdueLoans.length === 0 ? <p className="text-xs text-ink-soft">Nothing overdue.</p> : (
          <table className="w-full text-xs">
            <thead><tr className="text-left text-ink-soft"><th className="py-1">Item</th><th>With</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {data.overdueLoans.map((t) => (
                <tr key={t.id} className="border-t border-line"><td className="py-1">{t.item}</td><td>{t.with}</td><td className="font-mono">{new Date(t.dueDate).toLocaleDateString()}</td><td className="font-mono text-coral-ink">{t.status}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ───────────────────────── settings ─────────────────────────
function SettingsTab() {
  const { data, error, setData } = useLoad(() => api.adminSettings(), [])
  const [word, setWord] = useState('')
  const [cat, setCat] = useState({ id: '', label: '' })
  const [msg, setMsg] = useState('')

  const save = async (patch) => {
    try {
      const next = await api.adminSaveSettings(patch)
      setData(next)
      setMsg('Saved')
    } catch (err) {
      setMsg(err.message)
    }
  }
  if (error) return <p className="text-xs text-coral-ink">{error}</p>
  if (!data) return <p className="text-sm text-ink-soft">Loading…</p>

  return (
    <div className="space-y-4">
      {msg && <p className="text-xs">{msg}</p>}
      <div className={card}>
        <p className="text-sm font-medium">Banned words &amp; phrases</p>
        <p className="text-[11px] text-ink-soft mb-2">Listings and chat messages containing these are rejected.</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {data.bannedWords.map((w) => (
            <span key={w} className="text-[11px] bg-white border border-ink/20 rounded-full pl-2.5 pr-1 py-0.5 inline-flex items-center gap-1">
              {w}
              <button onClick={() => save({ bannedWords: data.bannedWords.filter((x) => x !== w) })} className="text-ink-soft hover:text-coral-ink px-1" aria-label={`remove ${w}`}>×</button>
            </span>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (word.trim()) save({ bannedWords: [...data.bannedWords, word.trim()] }); setWord('') }} className="flex gap-2">
          <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Add word or phrase" className="flex-1 bg-white border border-ink/30 rounded-md px-2 py-1 text-sm" />
          <button className={btn}>Add</button>
        </form>
      </div>
      <div className={card}>
        <p className="text-sm font-medium">Categories</p>
        <p className="text-[11px] text-ink-soft mb-2">Disabled categories disappear from Sell / Lend; existing listings stay.</p>
        <div className="space-y-1.5">
          {data.categories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.enabled !== false}
                onChange={(e) => save({ categories: data.categories.map((x) => (x.id === c.id ? { ...x, enabled: e.target.checked } : x)) })}
              />
              {c.label} <span className="text-[11px] font-mono text-ink-soft">{c.id}</span>
            </label>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!cat.label.trim()) return
            const id = (cat.id || cat.label).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)
            save({ categories: [...data.categories, { id, label: cat.label.trim(), tape: 'moss', enabled: true }] })
            setCat({ id: '', label: '' })
          }}
          className="flex gap-2 mt-3"
        >
          <input value={cat.label} onChange={(e) => setCat({ ...cat, label: e.target.value })} placeholder="New category label (e.g. Sports gear)" className="flex-1 bg-white border border-ink/30 rounded-md px-2 py-1 text-sm" />
          <button className={btn}>Add category</button>
        </form>
      </div>
    </div>
  )
}

// ───────────────────────── model info ─────────────────────────
function ModelTab() {
  const { data, error } = useLoad(() => api.adminFraudModel(), [])
  if (error) return <p className="text-xs text-coral-ink">{error}</p>
  if (!data) return <p className="text-sm text-ink-soft">Loading…</p>
  if (!data.loaded) return <p className="text-sm text-yellow-ink">{data.error || 'Fraud model not loaded. Run npm run ml:train and start the ML service.'}</p>
  const t = data.metrics?.test || {}
  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-sm font-medium">{data.algorithm}</p>
        <p className="text-[11px] text-ink-soft">Trained on: {data.trainedOn} · admin-confirmed labels: {data.nRealLabels}</p>
        <p className="text-[11px] font-mono mt-1">Thresholds: LOW {data.thresholds?.LOW} · MEDIUM {data.thresholds?.MEDIUM} · HIGH {data.thresholds?.HIGH}</p>
        {data.metrics?.supervised_stage && <p className="text-[11px] text-ink-soft mt-1">{data.metrics.supervised_stage}</p>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="ROC-AUC (held-out)" value={t.roc_auc} />
        <Stat label="Recall (MEDIUM+HIGH)" value={t.at_MEDIUM_or_HIGH?.recall} note={`precision ${t.at_MEDIUM_or_HIGH?.precision}`} />
        <Stat label="Precision (HIGH)" value={t.at_HIGH?.precision} note={`recall ${t.at_HIGH?.recall}`} />
        <Stat label="False alarms (normal users)" value={`${Math.round((t.false_alarm_rate_normal_users?.medium_or_high || 0) * 1000) / 10}%`} note={`rule baseline ${Math.round((t.rule_baseline_any_red_flag?.false_alarm_rate || 0) * 1000) / 10}%`} />
      </div>
      {t.per_archetype && (
        <div className={card}>
          <p className="text-sm font-medium mb-2">Detection by pattern (synthetic evaluation set)</p>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-ink-soft"><th className="py-1">Pattern</th><th>n</th><th>Flagged (MEDIUM+)</th><th>Held (HIGH)</th></tr></thead>
            <tbody>
              {Object.entries(t.per_archetype).map(([k, v]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-1">{k.replace(/_/g, ' ')}</td>
                  <td className="font-mono">{v.n}</td>
                  <td className="font-mono">{Math.round(v.flagged_medium_or_high * 100)}%</td>
                  <td className="font-mono">{Math.round(v.held_high * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10.5px] text-ink-soft mt-2">“normal”, “legit bargain” and “graduating senior” are honest students — their rows are false-alarm rates.</p>
        </div>
      )}
      <div className={card}>
        <p className="text-sm font-medium mb-1">Features ({data.features?.length})</p>
        <p className="text-[11px] font-mono text-ink-soft leading-relaxed">{data.features?.join(' · ')}</p>
      </div>
    </div>
  )
}

// ───────────────────────── audit log ─────────────────────────
function AuditTab() {
  const { data, error } = useLoad(() => api.adminAudit(), [])
  if (error) return <p className="text-xs text-coral-ink">{error}</p>
  if (!data) return <p className="text-sm text-ink-soft">Loading…</p>
  return (
    <div className="bg-paper-card border-[1.5px] border-ink rounded-md divide-y divide-line">
      {data.length === 0 && <p className="p-3 text-sm text-ink-soft">No entries yet.</p>}
      {data.map((a) => (
        <div key={a.id} className="p-3 text-xs flex gap-3">
          <span className="font-mono text-ink-soft shrink-0 w-32">{new Date(a.createdAt).toLocaleString()}</span>
          <div className="min-w-0">
            <p><span className="font-mono font-medium">{a.action}</span> by {a.actorName}</p>
            {a.reason && <p className="text-ink-soft">{a.reason}</p>}
            {a.action === 'trust_score_changed' && <p className="font-mono">{a.before?.trustScore} → {a.after?.trustScore}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
