import type { ReactNode } from "react"

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
}

export function Card({ children, className = "", title, subtitle }: CardProps) {
  return (
    <div className={`bg-brand-800 border border-brand-600 rounded-xl p-5 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
