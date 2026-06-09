import type { ReactNode } from "react"

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  subtitle?: string
}

export function Card({ children, className = "", title, subtitle }: CardProps) {
  return (
    <div className={`bg-brand-800 border border-brand-600 rounded-lg p-5 shadow-[var(--shadow-card)] ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-base font-semibold text-slate-200">{title}</h3>}
          {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
