import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'

export default function Toast({ message, show, onClose }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setVisible(true)
      const t = setTimeout(() => {
        setVisible(false)
        setTimeout(onClose, 250)
      }, 2800)
      return () => clearTimeout(t)
    }
  }, [show])

  if (!show) return null

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
      }`}
    >
      <div className="flex items-center gap-3 bg-ink text-paper px-5 py-3.5 rounded-lg shadow-lg border-[1.5px] border-ink">
        <CheckCircle2 size={20} className="text-tape-moss shrink-0" />
        <span className="text-sm font-medium font-display">{message}</span>
        <button onClick={() => { setVisible(false); setTimeout(onClose, 250) }} className="ml-2 opacity-60 hover:opacity-100">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
