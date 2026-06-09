import { useMemo } from "react"
import WordCloud from "react-d3-cloud"
import type { Palavra } from "../../api/dashboard"

interface Props {
  palavras: Palavra[]
  loading: boolean
  totalMencoes?: number
}

const CORES: Record<string, string> = {
  POSITIVA: "#22c55e",
  NEGATIVA: "#ef4444",
  NEUTRA: "#60a5fa",
  SEM_QUALIFICACAO: "#64748b",
}

// Opacidade mais alta para palavras mais frequentes
function hexComOpacidade(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function NuvemPalavras({ palavras, loading, totalMencoes }: Props) {
  const data = useMemo(() => {
    if (!palavras.length) return []
    return palavras.map((p) => ({ text: p.texto, value: p.frequencia, sentimento: p.sentimento }))
  }, [palavras])

  const maxVal = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data])
  const minVal = useMemo(() => Math.min(...data.map((d) => d.value), 1), [data])

  const fontSize = (d: { value: number }) => {
    const norm = (d.value - minVal) / (maxVal - minVal || 1)
    return Math.round(12 + norm * 36) // 12px – 48px (menor range = menos overflow)
  }

  const fill = (d: { text: string; value: number; sentimento?: string }) => {
    const cor = CORES[(d as { sentimento?: string }).sentimento ?? "NEUTRA"] ?? CORES.NEUTRA
    const norm = (d.value - minVal) / (maxVal - minVal || 1)
    const alpha = 0.55 + norm * 0.45 // 0.55 – 1.0
    return hexComOpacidade(cor, alpha)
  }

  const rotate = () => {
    // Maioria horizontal, alguns a ±30°
    const r = Math.random()
    if (r < 0.7) return 0
    return r < 0.85 ? 30 : -30
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-72 gap-3">
        <div className="w-6 h-6 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-600">Extraindo palavras das menções...</p>
      </div>
    )
  }

  if (!palavras.length) {
    return (
      <div className="flex items-center justify-center h-72">
        <p className="text-slate-500 text-sm">Nenhuma palavra encontrada no período</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Nuvem — overflow:hidden impede o SVG de vazar para outros cards */}
      <div style={{ height: 360, overflow: "hidden" }}>
        <WordCloud
          data={data}
          width={780}
          height={360}
          font="Inter, sans-serif"
          fontWeight="bold"
          fontSize={fontSize}
          fill={fill as (d: object, i: number) => string}
          rotate={rotate}
          padding={4}
          spiral="archimedean"
          random={() => 0.5}
        />
      </div>

      {/* Legenda + stats */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-1 border-t border-brand-700">
        <div className="flex items-center gap-4 text-xs">
          {Object.entries(CORES).map(([sent, cor]) => (
            <span key={sent} className="flex items-center gap-1.5" style={{ color: cor }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: cor }} />
              {sent === "POSITIVA" ? "Positivo"
                : sent === "NEGATIVA" ? "Negativo"
                : sent === "NEUTRA" ? "Neutro"
                : "Sem classif."}
            </span>
          ))}
        </div>
        {totalMencoes != null && (
          <p className="text-xs text-slate-600">
            {palavras.length} palavras extraídas de {totalMencoes.toLocaleString("pt-BR")} menções
          </p>
        )}
      </div>
    </div>
  )
}
