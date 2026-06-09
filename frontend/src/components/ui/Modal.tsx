import { useEffect } from "react"
import { X } from "lucide-react"

interface Props {
  titulo: string
  onClose: () => void
  children: React.ReactNode
}

export function Modal({ titulo, onClose, children }: Props) {
  // Fecha com Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Painel */}
      <div
        className="relative z-10 w-full max-w-lg bg-brand-900 border border-brand-600 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-700">
          <h2 className="text-sm font-semibold text-white">{titulo}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-brand-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
