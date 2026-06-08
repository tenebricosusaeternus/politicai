const colors: Record<string, string> = {
  low: "bg-green-500/10 text-green-400 border-green-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
}

const labels: Record<string, string> = {
  low: "Baixo",
  medium: "Moderado",
  high: "Alto",
  critical: "Crítico",
}

export function CrisisBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[level] ?? colors.low}`}>
      {labels[level] ?? level}
    </span>
  )
}
