import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { reportsApi } from "../api/reports"
import type { RelatorioListItem, ReportJob } from "../api/reports"
import { Card } from "../components/ui/Card"
import {
  FileText, Plus, Loader2, CheckCircle2,
  Calendar, Sparkles, Trash2, ExternalLink, Target, ShieldAlert
} from "lucide-react"

const NIVEL_CONFIG = [
  { cor: "bg-emerald-500", texto: "text-emerald-400", label: "Tranquilo" },
  { cor: "bg-green-400", texto: "text-green-400", label: "Normal" },
  { cor: "bg-yellow-400", texto: "text-yellow-400", label: "Atenção" },
  { cor: "bg-orange-500", texto: "text-orange-400", label: "Alerta" },
  { cor: "bg-red-500", texto: "text-red-400", label: "Crítico" },
]

const ACTIVE_REPORT_JOB_KEY = "politicai.activeReportJob"

function NivelBadge({ nivel }: { nivel: number }) {
  const cfg = NIVEL_CONFIG[Math.min(Math.max(nivel - 1, 0), 4)]
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className={`h-2 w-4 rounded-sm ${n <= nivel ? cfg.cor : "bg-brand-700"}`} />
        ))}
      </div>
      <span className={`text-xs font-medium ${cfg.texto}`}>{nivel}/5 — {cfg.label}</span>
    </div>
  )
}

export function Reports() {
  const navigate = useNavigate()
  const [relatorios, setRelatorios] = useState<RelatorioListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [job, setJob] = useState<ReportJob | null>(null)
  const [periodoInicio, setPeriodoInicio] = useState(format(new Date(), "yyyy-MM-dd"))
  const [periodoFim, setPeriodoFim] = useState(format(new Date(), "yyyy-MM-dd"))
  const [erro, setErro] = useState("")

  function load() {
    setLoading(true)
    reportsApi.listar()
      .then((d) => setRelatorios(d.items))
      .catch(() => setErro("Erro ao carregar relatórios"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const jobId = localStorage.getItem(ACTIVE_REPORT_JOB_KEY)
    if (!jobId) return
    setGerando(true)
    reportsApi.job(jobId)
      .then((j) => {
        if (j.status === "completed" && j.relatorio_id) {
          localStorage.removeItem(ACTIVE_REPORT_JOB_KEY)
          navigate(`/reports/${j.relatorio_id}`)
          return
        }
        if (j.status === "failed") {
          localStorage.removeItem(ACTIVE_REPORT_JOB_KEY)
          setErro(j.error || "Falha na geração do relatório")
          setGerando(false)
          setJob(null)
          return
        }
        setJob(j)
      })
      .catch(() => {
        localStorage.removeItem(ACTIVE_REPORT_JOB_KEY)
        setGerando(false)
      })
  }, [navigate])

  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return
    const timer = window.setInterval(() => {
      reportsApi.job(job.id)
        .then((j) => {
          setJob(j)
          if (j.status === "completed" && j.relatorio_id) {
            window.clearInterval(timer)
            localStorage.removeItem(ACTIVE_REPORT_JOB_KEY)
            setGerando(false)
            navigate(`/reports/${j.relatorio_id}`)
          } else if (j.status === "failed") {
            window.clearInterval(timer)
            localStorage.removeItem(ACTIVE_REPORT_JOB_KEY)
            setErro(j.error || "Falha na geração do relatório")
            setGerando(false)
          }
        })
        .catch(() => null)
    }, 2500)
    return () => window.clearInterval(timer)
  }, [job, navigate])

  function handleGerar() {
    setGerando(true)
    setJob(null)
    setErro("")
    reportsApi.gerarBackground(periodoInicio, periodoFim)
      .then((j) => {
        localStorage.setItem(ACTIVE_REPORT_JOB_KEY, j.id)
        setJob(j)
      })
      .catch((e) => {
        const msg = e?.response?.data?.detail || e.message || "Erro ao gerar"
        setErro(typeof msg === "string" ? msg : "Erro ao gerar relatório")
        setGerando(false)
      })
  }

  function handleDeletar(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm("Deletar este relatório?")) return
    reportsApi.deletar(id).then(load).catch(() => {})
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Central de Briefings</h1>
          <p className="text-base text-slate-400 mt-1">Transforme monitoramento em narrativa, decisão e ação.</p>
        </div>
      </div>

      {/* Gerador */}
      <Card>
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-brand-300" />
              <div>
                <h2 className="text-lg font-semibold text-white">Gerar briefing estratégico</h2>
                <p className="text-sm text-slate-500 mt-0.5">A IA monta a primeira versão com resumo executivo, riscos, evidências e recomendações.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="flex items-center gap-1.5 rounded-lg border border-brand-600 bg-brand-900/50 px-3 py-2 text-slate-400"><ShieldAlert size={13} className="text-amber-400" /> risco</span>
              <span className="flex items-center gap-1.5 rounded-lg border border-brand-600 bg-brand-900/50 px-3 py-2 text-slate-400"><Target size={13} className="text-emerald-400" /> ação</span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-400">Período início</label>
              <div className="flex items-center gap-2 bg-brand-900 border border-brand-600 rounded-lg px-4 py-3">
                <Calendar size={16} className="text-slate-400" />
                <input
                  type="date"
                  value={periodoInicio}
                  onChange={(e) => setPeriodoInicio(e.target.value)}
                  className="bg-transparent text-base text-slate-200 outline-none"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-400">Período fim</label>
              <div className="flex items-center gap-2 bg-brand-900 border border-brand-600 rounded-lg px-4 py-3">
                <Calendar size={16} className="text-slate-400" />
                <input
                  type="date"
                  value={periodoFim}
                  onChange={(e) => setPeriodoFim(e.target.value)}
                  className="bg-transparent text-base text-slate-200 outline-none"
                />
              </div>
            </div>
            <button
              onClick={handleGerar}
              disabled={gerando}
              className="flex items-center gap-2 bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-white text-base font-semibold px-5 py-3 rounded-lg transition-colors shadow-sm"
            >
              {gerando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {gerando ? "Gerando com IA..." : "Gerar briefing"}
            </button>
          </div>
          {gerando && (
            <div className="rounded-lg border border-brand-600 bg-brand-900/60 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-300 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin text-brand-300" />
                  {job?.message || "Iniciando geração em background..."}
                </p>
                <span className="text-xs font-semibold text-brand-300">{job?.progress ?? 5}%</span>
              </div>
              <div className="h-2 rounded-full bg-brand-700 overflow-hidden">
                <div
                  className="h-full bg-brand-300 transition-all duration-500"
                  style={{ width: `${Math.max(5, Math.min(100, job?.progress ?? 5))}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">
                Pode navegar para outra aba do sistema. A geração continua no backend e esta tela retoma o acompanhamento quando você voltar.
              </p>
            </div>
          )}
          {erro && <p className="text-sm text-red-400">{erro}</p>}
        </div>
      </Card>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 size={20} className="animate-spin text-brand-300" />
        </div>
      ) : relatorios.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText size={40} className="text-brand-700 mx-auto" />
          <p className="text-slate-400 text-base">Nenhum briefing gerado ainda.</p>
          <p className="text-slate-600 text-sm">Gere o primeiro e refine no editor estratégico.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {relatorios.map((r) => (
            <div
              key={r.id}
              onClick={() => navigate(`/reports/${r.id}`)}
              className="group bg-brand-800 border border-brand-600 hover:border-brand-400 rounded-lg p-5 cursor-pointer transition-all hover:shadow-lg hover:shadow-brand-900/20 space-y-4 shadow-[var(--shadow-card)]"
            >
              {/* Cabeçalho */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                    {r.periodo_inicio === r.periodo_fim
                      ? format(parseISO(r.periodo_inicio), "dd 'de' MMMM, yyyy", { locale: ptBR })
                      : `${format(parseISO(r.periodo_inicio), "dd/MM", { locale: ptBR })} – ${format(parseISO(r.periodo_fim), "dd/MM/yyyy", { locale: ptBR })}`}
                  </p>
                  <p className="text-base font-semibold text-white truncate">{r.titulo}</p>
                </div>
                <button
                  onClick={(e) => handleDeletar(r.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-brand-700 text-slate-500 hover:text-red-400 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Nível de alerta */}
              <NivelBadge nivel={r.nivel_alerta} />

              {/* Status + link */}
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  r.status === "publicado"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-brand-700 text-slate-400"
                }`}>
                  {r.status === "publicado" ? (
                    <span className="flex items-center gap-1"><CheckCircle2 size={10} /> Publicado</span>
                  ) : "Rascunho"}
                </span>
                <span className="text-xs text-brand-300 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  Abrir <ExternalLink size={10} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
