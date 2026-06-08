import { useEffect, useState } from "react"
import { format, subDays } from "date-fns"
import { listReports, getCrisisHistory } from "../api/reports"
import type { Report, CrisisPoint } from "../api/reports"
import { Card } from "../components/ui/Card"
import { CrisisBadge } from "../components/ui/CrisisBadge"
import { CrisisTimeline } from "../components/charts/CrisisTimeline"
import { Calendar, ChevronRight } from "lucide-react"

function crisisLevel(score: number | null) {
  if (score === null) return "low"
  if (score <= 3) return "low"
  if (score <= 5) return "medium"
  if (score <= 7.5) return "high"
  return "critical"
}

export function Reports() {
  const [reports, setReports] = useState<Report[]>([])
  const [history, setHistory] = useState<CrisisPoint[]>([])
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"))
  const [selected, setSelected] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      listReports(dateFrom, dateTo),
      getCrisisHistory(dateFrom, dateTo),
    ]).then(([r, h]) => {
      setReports(r)
      setHistory(h)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Relatórios</h1>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-brand-800 border border-brand-600 rounded-lg px-3 py-2">
            <Calendar size={13} className="text-slate-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent text-sm text-slate-200 outline-none w-32"
            />
          </div>
          <span className="text-slate-500 text-sm">até</span>
          <div className="flex items-center gap-1.5 bg-brand-800 border border-brand-600 rounded-lg px-3 py-2">
            <Calendar size={13} className="text-slate-400" />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent text-sm text-slate-200 outline-none w-32"
            />
          </div>
          <button
            onClick={load}
            className="bg-brand-400 hover:bg-brand-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Filtrar
          </button>
        </div>
      </div>

      <Card title="Evolução do Índice de Crise" subtitle={`${dateFrom} → ${dateTo}`}>
        {history.length > 0 ? (
          <CrisisTimeline data={history} />
        ) : (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
            Sem dados no período
          </div>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider px-1">
            {reports.length} relatório{reports.length !== 1 ? "s" : ""}
          </p>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : reports.length === 0 ? (
            <p className="text-slate-500 text-sm px-1">Sem relatórios no período.</p>
          ) : (
            reports.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  selected?.id === r.id
                    ? "bg-brand-600 border-brand-400"
                    : "bg-brand-800 border-brand-600 hover:bg-brand-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200 font-medium">{r.report_date}</span>
                  <ChevronRight size={14} className="text-slate-500" />
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <CrisisBadge level={crisisLevel(r.crisis_score)} />
                  {r.crisis_score !== null && (
                    <span className="text-xs text-slate-500">Score: {r.crisis_score.toFixed(1)}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="col-span-2">
          {selected ? (
            <Card>
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">{selected.title}</h2>
                    <p className="text-sm text-slate-400 mt-0.5">{selected.report_date}</p>
                  </div>
                  <CrisisBadge level={crisisLevel(selected.crisis_score)} />
                </div>

                {selected.summary && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Resumo</p>
                    <p className="text-sm text-slate-300 leading-relaxed">{selected.summary}</p>
                  </div>
                )}

                {selected.content && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Análise Completa</p>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{selected.content}</p>
                  </div>
                )}

                {selected.ai_insights && typeof selected.ai_insights === "object" && (
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Insights</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(selected.ai_insights as Record<string, string>).map(([k, v]) => (
                        <div key={k} className="bg-brand-700/50 rounded-lg p-3">
                          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{k}</p>
                          <p className="text-sm text-slate-200">{String(v)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
              Selecione um relatório para ver os detalhes
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
