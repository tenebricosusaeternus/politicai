import { useEffect, useState } from "react"
import { format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import ReactECharts from "echarts-for-react"
import { dashboardApi } from "../api/dashboard"
import { resolverImagem } from "../api/reports"
import type {
  ResumoSentimentos,
  ResumoDia,
  Tema,
  Palavra,
  ResumoVelocidade,
  ResumoPublicadores,
  ResumoPlataformas,
  ResumoHeatmap,
  HeatmapModo,
  SyncStatus,
  InsightsOficiais,
  InsightConta,
} from "../api/dashboard"
import { Card } from "../components/ui/Card"
import { TermometroClimatico } from "../components/dashboard/TermometroClimatico"
import { NuvemPalavras } from "../components/dashboard/NuvemPalavras"
import { VelocidadeMencoes } from "../components/analise/VelocidadeMencoes"
import { TopPublicadores } from "../components/analise/TopPublicadores"
import { GraficoBolhasPlataformas } from "../components/analise/GraficoBolhasPlataformas"
import { HeatmapAtividade } from "../components/analise/HeatmapAtividade"
import {
  Calendar, TrendingUp, Users, Eye, AlertTriangle, Tag,
  Thermometer, Wind, BarChart2, Activity, RefreshCw, Database,
  ExternalLink,
} from "lucide-react"

/** "há 12 min", "há 2 h", "há 3 dias" a partir de um ISO. */
function tempoRelativo(iso: string | null): string {
  if (!iso) return "nunca"
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "agora mesmo"
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} dia${d > 1 ? "s" : ""}`
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function sentScore(r: ResumoSentimentos | null): number {
  if (!r || r.total === 0) return 0
  return Math.round(((r.positivas - r.negativas) / r.total) * 100)
}

function scoreColor(score: number): string {
  if (score > 10) return "text-green-400"
  if (score < -5) return "text-red-400"
  return "text-amber-400"
}

function pctLabel(pct: number | null): string {
  if (pct === null) return "novo"
  return `${pct > 0 ? "+" : ""}${pct}%`
}

function deltaClass(delta: number): string {
  if (delta > 0) return "text-green-400"
  if (delta < 0) return "text-red-400"
  return "text-slate-500"
}

function themeColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function postEmbedUrl(link: string, rede: string): string {
  if (!link) return ""
  if (rede === "Instagram") return `${link.replace(/\/?(\?.*)?$/, "")}/embed`
  if (rede === "Facebook") {
    const endpoint = link.includes("/reel/") || link.includes("/videos/")
      ? "https://www.facebook.com/plugins/video.php"
      : "https://www.facebook.com/plugins/post.php"
    return `${endpoint}?href=${encodeURIComponent(link)}&show_text=false&width=320`
  }
  return ""
}

function RedeLogo({ rede }: { rede: string }) {
  if (rede === "Instagram") {
    return (
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#515bd4] flex items-center justify-center shadow-sm">
        <div className="w-5 h-5 rounded-md border-2 border-white relative">
          <div className="absolute left-1/2 top-1/2 w-1.5 h-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white" />
          <div className="absolute right-0.5 top-0.5 w-1 h-1 rounded-full bg-white" />
        </div>
      </div>
    )
  }

  return (
    <div className="w-9 h-9 rounded-lg bg-[#1877f2] flex items-end justify-center overflow-hidden shadow-sm">
      <span className="font-bold text-3xl leading-[0.92] font-sans" style={{ color: "#fff" }}>f</span>
    </div>
  )
}

export function Dashboard() {
  const hoje = new Date()
  const [dataInicio, setDataInicio] = useState(format(subDays(hoje, 6), "yyyy-MM-dd"))
  const [dataFim, setDataFim] = useState(format(hoje, "yyyy-MM-dd"))

  // Dados primários
  const [resumoIgor, setResumoIgor] = useState<ResumoSentimentos | null>(null)
  const [serie, setSerie] = useState<ResumoDia[]>([])
  const [temas, setTemas] = useState<Tema[]>([])
  const [nuvem, setNuvem] = useState<Palavra[]>([])
  const [nuvemTotal, setNuvemTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [temasLoading, setTemasLoading] = useState(false)
  const [nuvemLoading, setNuvemLoading] = useState(false)
  const [erro, setErro] = useState("")
  const [insights, setInsights] = useState<InsightsOficiais | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [thumbsComErro, setThumbsComErro] = useState<Record<string, boolean>>({})

  // Dados de análise
  const [velocidade, setVelocidade] = useState<ResumoVelocidade | null>(null)
  const [publicadores, setPublicadores] = useState<ResumoPublicadores | null>(null)
  const [plataformas, setPlataformas] = useState<ResumoPlataformas | null>(null)
  const [heatmap, setHeatmap] = useState<ResumoHeatmap | null>(null)
  const [heatmapModo, setHeatmapModo] = useState<HeatmapModo>("volume")
  const [loadingVel, setLoadingVel] = useState(false)
  const [loadingPub, setLoadingPub] = useState(false)
  const [loadingPlat, setLoadingPlat] = useState(false)
  const [loadingHeat, setLoadingHeat] = useState(false)

  // Estado da sincronização com o banco
  const [syncInfo, setSyncInfo] = useState<SyncStatus | null>(null)
  const [sincronizando, setSincronizando] = useState(false)

  function carregarSync() {
    dashboardApi.syncStatus().then(setSyncInfo).catch(() => {})
  }

  function sincronizarAgora() {
    setSincronizando(true)
    dashboardApi.sincronizar(7)
      .then(() => { carregarSync(); load() })
      .catch(() => {})
      .finally(() => setSincronizando(false))
  }

  function load() {
    carregarSync()
    const d1 = dataInicio
    const d2 = dataFim

    // KPIs + série
    setLoading(true)
    setErro("")
    Promise.all([
      dashboardApi.sentimentos("todos", d1, d2),
      dashboardApi.serieTemporal("todos", d1, d2),
    ])
      .then(([igor, st]) => {
        setResumoIgor(igor)
        setSerie(st.serie)
      })
      .catch((e) => setErro(e?.response?.data?.detail || e.message || "Erro ao carregar dados"))
      .finally(() => setLoading(false))

    // Temas
    setTemasLoading(true)
    setTemas([])
    dashboardApi.temas("todos", d1, d2)
      .then((r) => setTemas(r.temas))
      .catch(() => setTemas([]))
      .finally(() => setTemasLoading(false))

    // Nuvem
    setNuvemLoading(true)
    setNuvem([])
    dashboardApi.nuvemPalavras("todos", d1, d2)
      .then((r) => { setNuvem(r.palavras); setNuvemTotal(r.total_mencoes) })
      .catch(() => setNuvem([]))
      .finally(() => setNuvemLoading(false))

    // Canais oficiais: Insights do V-Tracker
    setInsightsLoading(true)
    setThumbsComErro({})
    dashboardApi.insightsOficiais(d1, d2)
      .then(setInsights)
      .catch(() => setInsights(null))
      .finally(() => setInsightsLoading(false))

    // Análise: velocidade
    setLoadingVel(true)
    dashboardApi.velocidade("todos", d1, d2)
      .then(setVelocidade)
      .catch(() => setVelocidade(null))
      .finally(() => setLoadingVel(false))

    // Análise: publicadores
    setLoadingPub(true)
    dashboardApi.publicadores("todos", d1, d2)
      .then(setPublicadores)
      .catch(() => setPublicadores(null))
      .finally(() => setLoadingPub(false))

    // Análise: plataformas
    setLoadingPlat(true)
    dashboardApi.plataformas("todos", d1, d2)
      .then(setPlataformas)
      .catch(() => setPlataformas(null))
      .finally(() => setLoadingPlat(false))

    // Análise: heatmap
    setLoadingHeat(true)
    dashboardApi.heatmap("todos", d1, d2, 5, heatmapModo)
      .then(setHeatmap)
      .catch(() => setHeatmap(null))
      .finally(() => setLoadingHeat(false))
  }

  function loadHeatmap(modo: HeatmapModo) {
    setHeatmapModo(modo)
    setLoadingHeat(true)
    dashboardApi.heatmap("todos", dataInicio, dataFim, 5, modo)
      .then(setHeatmap)
      .catch(() => setHeatmap(null))
      .finally(() => setLoadingHeat(false))
  }

  useEffect(() => { load() }, [])

  const today = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
  const score = sentScore(resumoIgor)
  const chartText = themeColor("--text-muted", "#64748b")
  const chartSubtle = themeColor("--text-subtle", "#94a3b8")
  const chartBorder = themeColor("--border-soft", "#d6e2f0")
  const canalOption = (conta: InsightConta) => {
    const outras =
      conta.postagens.salvos +
      conta.postagens.love +
      conta.postagens.haha +
      conta.postagens.wow +
      conta.postagens.sad +
      conta.postagens.angry
    return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      data: ["Likes", "Comentários", "Compart.", "Outras interações"],
      textStyle: { color: chartText },
      top: 0,
    },
    grid: { top: 42, right: 8, bottom: 20, left: 4, containLabel: true },
    xAxis: {
      type: "category",
      data: [conta.rede],
      axisLabel: { color: chartText, fontSize: 11 },
      axisLine: { lineStyle: { color: chartBorder } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: chartSubtle, formatter: (v: number) => fmt(v) },
      splitLine: { lineStyle: { color: chartBorder } },
    },
    series: [
      {
        name: "Likes",
        type: "bar",
        barMinHeight: 3,
        data: [conta.postagens.likes],
        itemStyle: { color: "#22c55e" },
      },
      {
        name: "Comentários",
        type: "bar",
        barMinHeight: 3,
        data: [conta.postagens.comentarios],
        itemStyle: { color: "#38bdf8" },
      },
      {
        name: "Compart.",
        type: "bar",
        barMinHeight: 3,
        data: [conta.postagens.compartilhamentos],
        itemStyle: { color: "#f59e0b" },
      },
      {
        name: "Outras interações",
        type: "bar",
        barMinHeight: 3,
        data: [outras],
        itemStyle: { color: "#a78bfa" },
      },
    ],
  }
  }

  const contasOficiais = [...(insights?.contas ?? [])].sort((a, b) => {
    if (a.rede === "Instagram") return -1
    if (b.rede === "Instagram") return 1
    return a.rede.localeCompare(b.rede)
  })

  const serieOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: {
      data: ["Positivas", "Negativas"],
      textStyle: { color: chartText },
      top: 0,
    },
    grid: { top: 40, bottom: 20, left: 10, right: 10, containLabel: true },
    xAxis: {
      type: "category",
      data: serie.map((d) =>
        format(new Date(d.data + "T12:00:00"), "dd/MM", { locale: ptBR }),
      ),
      axisLabel: { color: chartSubtle, fontSize: 11 },
      axisLine: { lineStyle: { color: chartBorder } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: chartSubtle, formatter: (v: number) => fmt(v) },
      splitLine: { lineStyle: { color: chartBorder } },
    },
    series: [
      {
        name: "Positivas",
        type: "bar",
        stack: "sentimento",
        data: serie.map((d) => d.positivas || 0),
        itemStyle: { color: "#22c55e" },
      },
      {
        name: "Negativas",
        type: "bar",
        stack: "sentimento",
        data: serie.map((d) => d.negativas || 0),
        itemStyle: { color: "#ef4444" },
      },
    ],
  }

  return (
    <div className="p-4 md:p-8 space-y-5 md:space-y-7 max-w-[1800px] mx-auto">

      {/* ── Header + filtros ── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Inteligência Política</h1>
            <p className="text-slate-400 text-base mt-1 capitalize">{today}</p>
          </div>

          {/* Indicador de última atualização do banco */}
          <div className="flex items-center gap-3 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 shadow-[var(--shadow-card)]">
            <Database size={17} className={syncInfo?.ultimo_status === "erro" ? "text-amber-400" : "text-emerald-500"} />
            <div className="leading-tight">
              <p className="text-sm text-slate-300">
                Atualizado <span className="font-medium text-white">{tempoRelativo(syncInfo?.ultima_sincronizacao ?? null)}</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {syncInfo ? `${syncInfo.total_mencoes.toLocaleString("pt-BR")} menções no banco` : "carregando…"}
              </p>
            </div>
            <button
              onClick={sincronizarAgora}
              disabled={sincronizando}
              title="Sincronizar agora com o V-Tracker"
              className="ml-1 p-2 rounded-md hover:bg-brand-700 text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={16} className={sincronizando ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 flex-1 min-w-[170px] shadow-[var(--shadow-card)]">
            <Calendar size={16} className="text-slate-400 flex-shrink-0" />
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-full"
            />
          </div>
          <span className="text-slate-500 text-base">até</span>
          <div className="flex items-center gap-2 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 flex-1 min-w-[170px] shadow-[var(--shadow-card)]">
            <Calendar size={16} className="text-slate-400 flex-shrink-0" />
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-full"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-white text-base font-semibold px-5 py-3 rounded-lg transition-colors whitespace-nowrap shadow-sm"
          >
            {loading ? "Carregando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={15} />
          {erro}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── KPIs ── */}
          {resumoIgor && (
	            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
	              <Card>
	                <p className="text-sm text-slate-500 mb-1">Menções totais</p>
	                <p className="text-3xl font-bold text-white tracking-tight">{fmt(resumoIgor.total)}</p>
	                <p className="text-sm text-slate-500 mt-1">Igor Normando</p>
	              </Card>
	              <Card>
	                <p className="text-sm text-slate-500 mb-1">Impressões</p>
	                <p className="text-3xl font-bold text-white tracking-tight">{fmt(resumoIgor.impressoes)}</p>
	                <div className="flex items-center gap-1.5 mt-1">
	                  <Eye size={14} className="text-slate-400" />
	                  <p className="text-sm text-slate-500">{fmt(resumoIgor.pessoas_alcancadas)} pessoas</p>
	                </div>
	              </Card>
	              <Card>
	                <p className="text-sm text-slate-500 mb-1">Score sentimento</p>
	                <p className={`text-3xl font-bold tracking-tight ${scoreColor(score)}`}>
	                  {score > 0 ? "+" : ""}{score}%
	                </p>
	                <p className="text-sm text-slate-500 mt-1">
	                  {resumoIgor.positivas}+ · {resumoIgor.negativas}-
	                </p>
	              </Card>
	              <Card>
	                <p className="text-sm text-slate-500 mb-1">Publicadores únicos</p>
	                <p className="text-3xl font-bold text-white tracking-tight">{fmt(resumoIgor.publicadores)}</p>
	                <div className="flex items-center gap-1.5 mt-1">
	                  <Users size={14} className="text-slate-400" />
	                  <p className="text-sm text-slate-500">vozes diferentes</p>
	                </div>
	              </Card>
            </div>
          )}

          {/* ── Canais oficiais ── */}
          <Card>
	            <div className="flex items-center gap-2 mb-5">
	              <BarChart2 size={18} className="text-brand-300" />
	              <p className="text-lg font-semibold text-white">Canais oficiais</p>
	              <span className="text-sm text-slate-500 ml-auto">Insights V-Tracker</span>
            </div>
            {insightsLoading ? (
              <div className="flex items-center justify-center h-36">
                <div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !insights || insights.contas.length === 0 ? (
              <p className="text-slate-500 text-sm">Sem dados de Insights para o período</p>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {contasOficiais.map((conta) => (
	                    <div key={conta.id} className="rounded-lg border border-brand-600 bg-brand-900/40 p-5 min-w-0">
                      <div className="grid grid-cols-1 2xl:grid-cols-[1fr_1.15fr] gap-4">
                        <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <RedeLogo rede={conta.rede} />
                          <div>
	                            <p className="text-lg font-semibold text-white">{conta.rede}</p>
	                            <p className="text-sm text-slate-500">{conta.nome}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          {[
                            {
                              label: "Seguidores",
                              value: conta.perfil.seguidores,
                              growth: conta.crescimento?.seguidores,
                            },
                            {
                              label: conta.rede === "Instagram" ? "Alcance" : "Impressões",
                              value: conta.rede === "Instagram" ? conta.perfil.alcance : conta.perfil.impressoes,
                              growth: conta.crescimento?.alcance_ou_impressoes,
                            },
                            {
                              label: "Engajamento",
                              value: conta.postagens.engajamento_total,
                              growth: conta.crescimento?.engajamento,
                            },
                            {
                              label: "Posts",
                              value: conta.postagens.total_posts,
                              growth: conta.crescimento?.posts,
                            },
                          ].map((metric) => (
	                            <div key={metric.label} className="rounded-md bg-brand-800/70 border border-brand-600/70 p-3">
	                              <p className="text-xs text-slate-500 uppercase tracking-wide">{metric.label}</p>
	                              <p className="text-2xl font-bold text-white tracking-tight">{fmt(metric.value)}</p>
	                              {metric.growth && (
	                                <p className={`text-sm font-medium ${deltaClass(metric.growth.delta)}`}>
	                                  {pctLabel(metric.growth.pct)} vs período anterior
	                                </p>
	                              )}
                            </div>
                          ))}
                        </div>
                        {conta.rede === "Facebook" && (
	                          <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                            <span>+{fmt(conta.perfil.follows)} follows</span>
                            <span>-{fmt(conta.perfil.unfollows)} unfollows</span>
                            <span>{fmt(conta.perfil.views)} views</span>
                          </div>
                        )}
                      </div>
                        <div className="min-w-0">
                          <ReactECharts option={canalOption(conta)} style={{ height: 220 }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
	                  <p className="text-sm text-slate-500 uppercase tracking-widest font-semibold">Top posts oficiais</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {insights.top_posts.slice(0, 6).map((post) => {
                      const postKey = `${post.rede}-${post.id}`
                      const embedUrl = postEmbedUrl(post.link || "", post.rede || "")
                      const usarEmbed = !post.thumbnail || thumbsComErro[postKey]
                      return (
                        <div key={postKey} className="overflow-hidden rounded-lg border border-brand-600 bg-brand-900/40">
                          <div className="flex h-[132px]">
                            {!usarEmbed ? (
                              <img
                                src={resolverImagem(post.thumbnail)}
                                alt=""
                                className="w-28 sm:w-36 h-full object-cover bg-brand-700 flex-shrink-0"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={() => setThumbsComErro((prev) => ({ ...prev, [postKey]: true }))}
                              />
                            ) : embedUrl ? (
                              <div className="w-28 sm:w-36 h-full bg-brand-700 overflow-hidden relative flex-shrink-0">
                                <iframe
                                  src={embedUrl}
                                  title={post.texto || post.link}
                                  className="absolute top-0 left-0 border-0 bg-white pointer-events-none"
                                  style={{ width: 326, height: 460, transform: "scale(0.44)", transformOrigin: "top left" }}
                                  loading="lazy"
                                  sandbox="allow-scripts allow-same-origin allow-popups"
                                />
                              </div>
                            ) : (
                              <div className="w-28 sm:w-36 h-full bg-brand-700 flex items-center justify-center text-xs text-slate-500 flex-shrink-0">
                                sem imagem
                              </div>
                            )}
                            <div className="flex-1 p-3 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-700 text-brand-200 border border-brand-500">
                                  {post.rede}
                                </span>
                                <span className="text-xs text-slate-500 truncate">{post.tipo || "Post"} · {post.data}</span>
                                {post.link && (
                                  <a href={post.link} target="_blank" rel="noopener noreferrer" className="ml-auto text-slate-500 hover:text-brand-300 flex-shrink-0">
                                    <ExternalLink size={13} />
                                  </a>
                                )}
                              </div>
                              <p className="text-sm text-slate-200 line-clamp-2">{post.texto || "(sem texto)"}</p>
                              <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-500">
                                <span className="text-white font-semibold">{fmt(post.engajamento)} eng.</span>
                                <span>{fmt(post.likes)} likes</span>
                                <span>{fmt(post.comentarios)} comentários</span>
                                <span>{fmt(post.compartilhamentos)} shares</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* ── Série temporal + Termômetro ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card className="h-full">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={14} className="text-brand-300" />
                  <p className="text-sm font-semibold text-white">Sentimentos por dia</p>
                  <span className="text-xs text-slate-500 ml-auto">{serie.length} dias</span>
                </div>
                {serie.length > 0 ? (
                  <ReactECharts option={serieOption} style={{ height: 200 }} />
                ) : (
                  <p className="text-slate-500 text-sm">Sem dados no período</p>
                )}
              </Card>
            </div>
            <div className="lg:col-span-1">
              <Card className="h-full">
                <div className="flex items-center gap-2 mb-1">
                  <Thermometer size={14} className="text-brand-300" />
                  <p className="text-sm font-semibold text-white">Clima Político</p>
                </div>
                <TermometroClimatico resumo={resumoIgor} loading={loading} />
              </Card>
            </div>
          </div>

          {/* ── Detalhamento sentimentos ── */}
          {resumoIgor && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {[
                { label: "Positivas", value: resumoIgor.positivas, color: "text-green-400", bg: "bg-green-500/10 border-green-500/30" },
                { label: "Negativas", value: resumoIgor.negativas, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
                { label: "Neutras/VTracker", value: resumoIgor.neutras, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
                { label: "Sem qualif.", value: resumoIgor.sem_qualificacao, color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/30" },
              ].map((item) => (
                <div key={item.label} className={`rounded-xl border p-4 ${item.bg}`}>
                  <p className={`text-2xl font-bold ${item.color}`}>{fmt(item.value)}</p>
                  <p className="text-xs text-slate-500 mt-1">{item.label}</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {resumoIgor.total > 0
                      ? `${((item.value / resumoIgor.total) * 100).toFixed(1)}%`
                      : "0%"}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Nuvem de Palavras ── */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Wind size={14} className="text-brand-300" />
              <p className="text-sm font-semibold text-white">Nuvem de Palavras</p>
              {nuvemLoading && (
                <div className="ml-auto w-4 h-4 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <NuvemPalavras palavras={nuvem} loading={nuvemLoading} totalMencoes={nuvemTotal} />
          </Card>

          {/* ── Principais Temas ── */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Tag size={14} className="text-brand-300" />
              <p className="text-sm font-semibold text-white">Principais Temas</p>
              {temasLoading && (
                <div className="ml-auto w-4 h-4 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            {temasLoading && temas.length === 0 ? (
              <p className="text-slate-500 text-sm">Classificando menções...</p>
            ) : temas.length === 0 ? (
              <p className="text-slate-500 text-sm">Nenhum tema identificado no período</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {temas.map((tema, i) => {
                  const pctNeutro = Math.max(0, 100 - tema.pct_positivo - tema.pct_negativo)
                  return (
                    <div key={tema.slug} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-600 w-4">#{i + 1}</span>
                          <span className="text-sm text-slate-200 font-medium">{tema.nome}</span>
                        </div>
                        <span className="text-xs font-mono text-slate-400">{fmt(tema.total)} menções</span>
                      </div>
                      <div className="flex h-2.5 rounded-full overflow-hidden bg-brand-700">
                        <div style={{ width: `${tema.pct_positivo}%` }} className="bg-green-500 transition-all" />
                        <div style={{ width: `${pctNeutro}%` }} className="bg-blue-500/40 transition-all" />
                        <div style={{ width: `${tema.pct_negativo}%` }} className="bg-red-500 transition-all" />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-600">
                        <span className="text-green-500">{tema.positivas} pos.</span>
                        <span className="text-red-500">{tema.negativas} neg.</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* ── Divisor de seção ── */}
          <div className="border-t border-brand-700 pt-2">
            <p className="text-xs text-slate-500 uppercase tracking-widest font-medium">Análise aprofundada</p>
          </div>

          {/* ── Velocidade (largura total) ── */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={14} className="text-brand-300" />
              <p className="text-sm font-semibold text-white">Velocidade — período atual vs anterior</p>
            </div>
            <VelocidadeMencoes data={velocidade} loading={loadingVel} />
          </Card>

          {/* ── Plataformas + Top Publicadores (50/50) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={14} className="text-brand-300" />
                <p className="text-sm font-semibold text-white">Plataformas — volume × sentimento</p>
              </div>
              <GraficoBolhasPlataformas data={plataformas} loading={loadingPlat} />
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Users size={14} className="text-brand-300" />
                <p className="text-sm font-semibold text-white">Top publicadores</p>
              </div>
              <TopPublicadores data={publicadores} loading={loadingPub} />
            </Card>
          </div>

          {/* ── Heatmap (largura total) ── */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={14} className="text-brand-300" />
              <p className="text-sm font-semibold text-white">Atividade — hora do dia × dia da semana</p>
            </div>
            <HeatmapAtividade
              data={heatmap}
              loading={loadingHeat}
              modo={heatmapModo}
              onModoChange={loadHeatmap}
            />
          </Card>
        </>
      )}
    </div>
  )
}
