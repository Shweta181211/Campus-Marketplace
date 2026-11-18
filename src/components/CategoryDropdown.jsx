import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { categories } from '../data/mockData'

export default function CategoryDropdown({ value, onChange, placeholder = 'All categories', allowAll = true }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = categories.find((c) => c.id === value)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-white border-[1.5px] border-ink rounded-md px-3.5 py-2 text-sm font-medium w-full min-w-[150px] justify-between hover:bg-paper transition-colors"
      >
        <span className="flex items-center gap-2">
          {selected && <selected.icon size={15} />}
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-2 left-0 w-full min-w-52 bg-white border-[1.5px] border-ink rounded-md shadow-lg z-20 py-1.5 max-h-72 overflow-y-auto">
          {allowAll && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className="w-full flex items-center justify-between px-3.5 py-2 text-sm hover:bg-paper text-left"
            >
              {placeholder}
              {!value && <Check size={14} />}
            </button>
          )}
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => { onChange(c.id); setOpen(false) }}
              className="w-full flex items-center justify-between px-3.5 py-2 text-sm hover:bg-paper text-left"
            >
              <span className="flex items-center gap-2"><c.icon size={15} />{c.label}</span>
              {value === c.id && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
