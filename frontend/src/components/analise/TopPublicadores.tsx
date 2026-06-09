import { useState } from "react"
import type { PublicadorItem, ResumoPublicadores } from "../../api/dashboard"
import { ExternalLink } from "lucide-react"

interface Props {
  data: ResumoPublicadores | null
  loading: boolean
}

type Aba = "todos" | "positivos" | "negativos"

const ABAS: { id: Aba; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "positivos", label: "Positivos" },
  { id: "negativos", label: "Negativos" },
]

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function scoreColor(s: number) {
  if (s > 20) return "text-green-400"
  if (s < -10) return "text-red-400"
  return "text-slate-400"
}

function buildLink(link: string, plataformas: string[]): string {
  if (!link) return ""
  if (link.startsWith("http://") || link.startsWith("https://")) return link
  const lp = plataformas.map((p) => p.toLowerCase())
  if (lp.some((p) => p.includes("facebook"))) return `https://facebook.com/${link}`
  if (lp.some((p) => p.includes("instagram"))) return `https://instagram.com/${link}`
  if (lp.some((p) => p.includes("twitter") || p.includes("x.com"))) return `https://x.com/${link}`
  return `https://${link}`
}

function Linha({ pub, rank }: { pub: PublicadorItem; rank: number }) {
  const pos = pub.total > 0 ? (pub.positivas / pub.total) * 100 : 0
  const neg = pub.total > 0 ? (pub.negativas / pub.total) * 100 : 0
  const neutro = 100 - pos - neg
  const inicial = (pub.nome || "?")[0].toUpperCase()
  const href = pub.link ? buildLink(pub.link, pub.plataformas) : ""

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-brand-700/40 last:border-0">
      {/* Rank + avatar */}
      <span className="text-xs text-slate-600 font-mono w-5 text-right flex-shrink-0">{rank}</span>
      <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
        {inicial}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-slate-200 truncate font-medium">{pub.nome}</p>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer"
              className="text-slate-600 hover:text-brand-300 transition-colors flex-shrink-0">
              <ExternalLink size={11} />
            </a>
          )}
        </div>
        {pub.plataformas.length > 0 && (
          <p className="text-xs text-slate-600 truncate">{pub.plataformas.join(" · ")}</p>
        )}
        {/* Barra de sentimento */}
        <div className="flex h-1.5 rounded-full overflow-hidden bg-brand-700 mt-1.5">
          <div style={{ width: `${pos}%` }} className="bg-green-500" />
          <div style={{ width: `${neutro}%` }} className="bg-blue-500/50" />
          <div style={{ width: `${neg}%` }} className="bg-red-500" />
        </div>
      </div>

      {/* Métricas */}
      <div className="text-right flex-shrink-0 space-y-0.5">
        <p className="text-white font-bold text-sm">{fmt(pub.total)}</p>
        <p className={`text-xs font-mono ${scoreColor(pub.score_sentimento)}`}>
          {pub.score_sentimento > 0 ? "+" : ""}{pub.score_sentimento}%
        </p>
        {pub.engajamento > 0 && (
          <p className="text-xs text-slate-600">{fmt(pub.engajamento)} eng.</p>
        )}
      </div>
    </div>
  )
}

export function TopPublicadores({ data, loading }: Props) {
  const [aba, setAba] = useState<Aba>("todos")

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!data || !data.publicadores.length) {
    return <p className="text-slate-500 text-sm">Sem dados de publicadores</p>
  }

  const filtrados: PublicadorItem[] =
    aba === "positivos"
      ? [...data.publicadores].sort((a, b) => b.score_sentimento - a.score_sentimento).slice(0, 15)
      : aba === "negativos"
      ? [...data.publicadores].sort((a, b) => a.score_sentimento - b.score_sentimento).slice(0, 15)
      : data.publicadores.slice(0, 15)

  return (
    <div className="space-y-3">
      {/* Abas */}
      <div className="flex gap-1">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
              aba === a.id
                ? "bg-brand-500 text-white font-medium"
                : "text-slate-400 hover:text-white hover:bg-brand-700"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="max-h-80 overflow-y-auto pr-1">
        {filtrados.map((pub, i) => (
          <Linha key={pub.nome} pub={pub} rank={i + 1} />
        ))}
      </div>

      <p className="text-xs text-slate-600">
        {data.mencoes_analisadas.toLocaleString("pt-BR")} menções analisadas
      </p>
    </div>
  )
}
