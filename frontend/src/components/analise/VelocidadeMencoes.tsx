import type { ResumoVelocidade } from "../../api/dashboard"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

interface Props {
  data: ResumoVelocidade | null
  loading: boolean
}

function Variacao({ valor, invertido = false, sufixo = "%" }: {
  valor: number | null
  invertido?: boolean
  sufixo?: string
}) {
  if (valor === null) return <span className="text-slate-500 text-sm">—</span>
  const positivo = invertido ? valor < 0 : valor > 0
  const neutro = valor === 0
  const cor = neutro ? "text-slate-400" : positivo ? "text-green-400" : "text-red-400"
  const Icone = neutro ? Minus : positivo ? TrendingUp : TrendingDown
  return (
    <span className={`flex items-center gap-1 font-bold text-sm ${cor}`}>
      <Icone size={14} />
      {valor > 0 ? "+" : ""}{valor}{sufixo}
    </span>
  )
}

function fmtData(iso: string) {
  try {
    return format(new Date(iso + "T12:00:00"), "dd/MM", { locale: ptBR })
  } catch {
    return iso
  }
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function VelocidadeMencoes({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!data) return <p className="text-slate-500 text-sm">Sem dados</p>

  const { periodo_atual: atual, periodo_anterior: ant } = data

  const rows = [
    {
      label: "Menções totais",
      atual: fmt(atual.total),
      anterior: fmt(ant.total),
      variacao: <Variacao valor={data.variacao_total_pct} />,
    },
    {
      label: "Positivas",
      atual: fmt(atual.positivas),
      anterior: fmt(ant.positivas),
      variacao: <Variacao valor={data.variacao_positivas_pct} />,
    },
    {
      label: "Negativas",
      atual: fmt(atual.negativas),
      anterior: fmt(ant.negativas),
      variacao: <Variacao valor={data.variacao_negativas_pct} invertido />,
    },
    {
      label: "Score sentimento",
      atual: `${atual.score_sentimento > 0 ? "+" : ""}${atual.score_sentimento}%`,
      anterior: `${ant.score_sentimento > 0 ? "+" : ""}${ant.score_sentimento}%`,
      variacao: <Variacao valor={data.variacao_score_pts} sufixo=" pts" />,
    },
  ]

  return (
    <div className="space-y-4">
      {/* Cabeçalho dos períodos */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div />
        <div className="text-center">
          <p className="text-slate-400 font-medium">Período atual</p>
          <p className="text-slate-600">{fmtData(atual.inicio)} – {fmtData(atual.fim)}</p>
        </div>
        <div className="text-center">
          <p className="text-slate-500">Período anterior</p>
          <p className="text-slate-600">{fmtData(ant.inicio)} – {fmtData(ant.fim)}</p>
        </div>
      </div>

      {/* Linhas de comparação */}
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-3 gap-2 items-center py-2 border-b border-brand-700/50 last:border-0">
            <p className="text-xs text-slate-400">{row.label}</p>
            <div className="text-center">
              <p className="text-white font-bold text-base">{row.atual}</p>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-slate-500 text-sm">{row.anterior}</p>
              {row.variacao}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
