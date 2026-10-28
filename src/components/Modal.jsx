import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, children, wide }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[1px] animate-[fadeIn_0.2s_ease]" onClick={onClose} />
      <div
        className={`relative bg-paper border-[1.5px] border-ink rounded-lg shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[88vh] overflow-y-auto animate-[popIn_0.2s_ease]`}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white border-[1.5px] border-ink flex items-center justify-center hover:rotate-90 transition-transform"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {children}
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.96) translateY(8px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
    </div>
  )
}
