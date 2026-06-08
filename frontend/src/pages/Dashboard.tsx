import { useEffect, useState } from "react"
import { format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { getToday, getCrisisHistory } from "../api/reports"
import type { Report, CrisisPoint } from "../api/reports"
import { getEventsToday } from "../api/events"
import type { PoliticalEvent } from "../api/events"
import { Card } from "../components/ui/Card"
import { CrisisBadge } from "../components/ui/CrisisBadge"
import { CrisisGauge } from "../components/charts/CrisisGauge"
import { CrisisTimeline } from "../components/charts/CrisisTimeline"
import { SeverityBar } from "../components/charts/SeverityBar"
import { AlertTriangle, TrendingUp, Calendar } from "lucide-react"

function crisisLevel(score: number | null) {
  if (score === null) return "low"
  if (score <= 3) return "low"
  if (score <= 5) return "medium"
  if (score <= 7.5) return "high"
  return "critical"
}

export function Dashboard() {
  const [report, setReport] = useState<Report | null>(null)
  const [history, setHistory] = useState<CrisisPoint[]>([])
  const [events, setEvents] = useState<PoliticalEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const dateFrom = format(subDays(new Date(), 30), "yyyy-MM-dd")

    Promise.allSettled([
      getToday(),
      getCrisisHistory(dateFrom),
      getEventsToday(),
    ]).then(([r, h, e]) => {
      if (r.status === "fulfilled") setReport(r.value)
      if (h.status === "fulfilled") setHistory(h.value)
      if (e.status === "fulfilled") setEvents(e.value)
      setLoading(false)
    })
  }, [])

  const today = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  const criticalCount = events.filter((e) => e.severity === "critical").length
  const highCount = events.filter((e) => e.severity === "high").length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5 capitalize">{today}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Calendar size={14} />
          Atualizado agora
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <p className="text-xs text-slate-500 mb-1">Índice de Crise</p>
              <p className="text-2xl font-bold text-white">
                {report?.crisis_score?.toFixed(1) ?? "—"}
                <span className="text-sm text-slate-500">/10</span>
              </p>
              <div className="mt-2">
                <CrisisBadge level={crisisLevel(report?.crisis_score ?? null)} />
              </div>
            </Card>

            <Card>
              <p className="text-xs text-slate-500 mb-1">Eventos Hoje</p>
              <p className="text-2xl font-bold text-white">{events.length}</p>
              <p className="text-xs text-slate-500 mt-2">
                {criticalCount > 0 && <span className="text-red-400">{criticalCount} crítico{criticalCount > 1 ? "s" : ""}</span>}
                {criticalCount > 0 && highCount > 0 && " · "}
                {highCount > 0 && <span className="text-orange-400">{highCount} alto{highCount > 1 ? "s" : ""}</span>}
                {criticalCount === 0 && highCount === 0 && "Nenhum alerta"}
              </p>
            </Card>

            <Card>
              <p className="text-xs text-slate-500 mb-1">Sentimento</p>
              <p className="text-2xl font-bold text-white">
                {report?.sentiment_score !== null && report?.sentiment_score !== undefined
                  ? (report.sentiment_score > 0 ? "+" : "") + report.sentiment_score.toFixed(2)
                  : "—"}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {report?.sentiment_score !== null && report?.sentiment_score !== undefined
                  ? report.sentiment_score > 0.2 ? "Positivo" : report.sentiment_score < -0.2 ? "Negativo" : "Neutro"
                  : "Sem dados"}
              </p>
            </Card>

            <Card>
              <p className="text-xs text-slate-500 mb-1">Histórico 30d</p>
              <p className="text-2xl font-bold text-white">{history.length}</p>
              <p className="text-xs text-slate-500 mt-2">relatórios disponíveis</p>
            </Card>
          </div>

          {/* Gauge + Timeline */}
          <div className="grid grid-cols-3 gap-4">
            <Card title="Termômetro de Crise" subtitle="Leitura do dia">
              <CrisisGauge score={report?.crisis_score ?? 0} />
            </Card>

            <Card title="Histórico de Crise" subtitle="Últimos 30 dias" className="col-span-2">
              {history.length > 0 ? (
                <CrisisTimeline data={history} />
              ) : (
                <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                  Sem histórico disponível
                </div>
              )}
            </Card>
          </div>

          {/* Eventos + Distribuição */}
          <div className="grid grid-cols-3 gap-4">
            <Card title="Distribuição de Eventos" subtitle="Por severidade hoje">
              {events.length > 0 ? (
                <SeverityBar events={events} />
              ) : (
                <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
                  Sem eventos hoje
                </div>
              )}
            </Card>

            <Card title="Eventos Prioritários" subtitle="Hoje · por severidade" className="col-span-2">
              {events.length === 0 ? (
                <p className="text-slate-500 text-sm">Sem eventos registrados hoje.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {events.slice(0, 8).map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-start gap-3 p-3 bg-brand-700/50 rounded-lg hover:bg-brand-700 transition-colors"
                    >
                      <AlertTriangle
                        size={14}
                        className={`mt-0.5 flex-shrink-0 ${
                          ev.severity === "critical" ? "text-red-400" :
                          ev.severity === "high" ? "text-orange-400" :
                          ev.severity === "medium" ? "text-amber-400" : "text-green-400"
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200 truncate">{ev.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <CrisisBadge level={ev.severity} />
                          {ev.location && (
                            <span className="text-xs text-slate-500">{ev.location}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Sumário IA */}
          {report?.summary && (
            <Card title="Análise do Dia" subtitle="Gerado por IA">
              <div className="flex gap-3">
                <TrendingUp size={16} className="text-brand-300 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-300 leading-relaxed">{report.summary}</p>
              </div>
            </Card>
          )}

          {/* Insights IA */}
          {report?.ai_insights && typeof report.ai_insights === "object" && (
            <Card title="Insights de Inteligência" subtitle="Pontos-chave do dia">
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(report.ai_insights as Record<string, string>).map(([key, value]) => (
                  <div key={key} className="bg-brand-700/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{key}</p>
                    <p className="text-sm text-slate-200">{String(value)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
