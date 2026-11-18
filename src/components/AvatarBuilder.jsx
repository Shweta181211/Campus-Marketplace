import { useEffect, useState } from 'react'
import { Shuffle } from 'lucide-react'
import { AvatarFigure } from './Avatar'
import { api } from '../api'

const LABELS = {
  face: 'Face',
  skin: 'Skin tone',
  hair: 'Hair',
  hairColor: 'Hair colour',
  outfit: 'Outfit',
  outfitColor: 'Outfit colour',
  accessory: 'Accessory',
  bg: 'Background',
}
const isColor = (v) => typeof v === 'string' && v.startsWith('#')

export default function AvatarBuilder({ initial, onSaved, onCancel }) {
  const [options, setOptions] = useState(null)
  const [cfg, setCfg] = useState(initial || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getAvatarOptions()
      .then((o) => {
        setOptions(o)
        setCfg((c) => Object.fromEntries(Object.entries(o).map(([k, vals]) => [k, vals.includes(c[k]) ? c[k] : vals[0]])))
      })
      .catch((e) => setError(e.message))
  }, [])

  const shuffle = () => {
    if (!options) return
    setCfg(Object.fromEntries(Object.entries(options).map(([k, vals]) => [k, vals[Math.floor(Math.random() * vals.length)]])))
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const user = await api.updateProfile({ avatarConfig: cfg })
      onSaved?.(user)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!options) return <p className="text-xs text-ink-soft">{error || 'Loading avatar parts…'}</p>

  return (
    <div className="flex flex-col sm:flex-row gap-5">
      <div className="shrink-0 flex flex-col items-center gap-2">
        <div className="w-32 h-32 rounded-md border-[1.5px] border-ink overflow-hidden bg-white">
          <AvatarFigure config={cfg} />
        </div>
        <button type="button" onClick={shuffle} className="text-xs inline-flex items-center gap-1 border border-ink/40 rounded-full px-3 py-1">
          <Shuffle size={12} /> Random
        </button>
      </div>
      <div className="flex-1 space-y-2.5">
        {Object.entries(options).map(([key, values]) => (
          <div key={key}>
            <p className="text-[11px] font-mono text-ink-soft mb-1">{LABELS[key] || key}</p>
            <div className="flex flex-wrap gap-1.5">
              {values.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCfg((c) => ({ ...c, [key]: v }))}
                  aria-label={`${LABELS[key]} ${v}`}
                  className={
                    isColor(v)
                      ? `w-6 h-6 rounded-full border-2 ${cfg[key] === v ? 'border-ink' : 'border-transparent'}`
                      : `text-[11px] px-2.5 py-1 rounded-full border capitalize ${cfg[key] === v ? 'bg-ink text-paper border-ink' : 'bg-white border-ink/30'}`
                  }
                  style={isColor(v) ? { background: v } : undefined}
                >
                  {isColor(v) ? '' : v}
                </button>
              ))}
            </div>
          </div>
        ))}
        {error && <p className="text-xs text-coral-ink">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={saving} onClick={save} className="bg-ink text-paper rounded-full px-4 py-1.5 text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save avatar'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-ink-soft px-3">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
