import ReactECharts from "echarts-for-react"
import {
  Info, CheckCircle2, AlertTriangle, ImagePlus, Loader2, X,
  BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon,
  TrendingUp, TrendingDown, MessageCircle,
  ExternalLink,
} from "lucide-react"
import { useState } from "react"
import type { Bloco, GraficoDados, MetricaItem } from "../../api/reports"
import { resolverImagem, reportsApi } from "../../api/reports"

interface Props {
  bloco: Bloco
  editing: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (dados: any) => void
}

const CORES = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"]
const ZONAS_SENTIMENTO = [
  { label: "Crise", max: 20, color: "#dc2626", desc: "Clima muito negativo" },
  { label: "Alerta", max: 40, color: "#ea580c", desc: "Pressão crescente" },
  { label: "Moderado", max: 60, color: "#ca8a04", desc: "Equilíbrio entre apoios e críticas" },
  { label: "Favorável", max: 80, color: "#16a34a", desc: "Boa percepção pública" },
  { label: "Ótimo", max: 101, color: "#15803d", desc: "Clima muito positivo" },
] as const

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

function pct(part: number, total: number): number {
  return total ? Math.round((part / total) * 100) : 0
}

function scoreParaGauge(score: number): number {
  return Math.max(0, Math.min(100, 50 + score))
}

function zonaSentimento(v: number) {
  return ZONAS_SENTIMENTO.find((z) => v < z.max) ?? ZONAS_SENTIMENTO[ZONAS_SENTIMENTO.length - 1]
}

function deltaText(delta?: { pct: number | null; delta: number }) {
  if (!delta) return ""
  if (delta.pct === null) return "novo"
  return `${delta.pct > 0 ? "+" : ""}${delta.pct}%`
}

function deltaClass(delta?: { pct: number | null; delta: number }) {
  if (!delta) return "text-slate-500"
  if (Number(delta.delta || 0) > 0) return "text-emerald-500"
  if (Number(delta.delta || 0) < 0) return "text-red-500"
  return "text-slate-500"
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

export function BlocoView({ bloco, editing, onChange }: Props) {
  const d = bloco.dados || {}
  const set = (campo: string, valor: unknown) => onChange({ ...d, [campo]: valor })

  switch (bloco.tipo) {
    case "hero_resumo":
      return <HeroResumo dados={d} />

    case "sentimento_painel":
      return <SentimentoPainel dados={d} />

    case "performance_oficial":
      return <PerformanceOficial dados={d} />

    case "top_posts":
      return <TopPosts dados={d} />

    case "temas_principais":
      return <TemasPrincipais dados={d} />

    // ── Título ──
    case "titulo": {
      const nivel = d.nivel || 2
      const cls = nivel === 1 ? "text-2xl font-bold" : nivel === 2 ? "text-xl font-bold" : "text-base font-semibold"
      if (editing) {
        return (
          <div className="flex items-center gap-2">
            <select
              value={nivel}
              onChange={(e) => set("nivel", Number(e.target.value))}
              className="bg-brand-900 border border-brand-600 rounded px-2 py-1 text-xs text-slate-300"
            >
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
            <input
              value={d.texto || ""}
              onChange={(e) => set("texto", e.target.value)}
              placeholder="Título…"
              className={`flex-1 bg-brand-900/60 border border-brand-400/40 rounded-lg px-3 py-1.5 text-white outline-none focus:border-brand-300 ${cls}`}
            />
          </div>
        )
      }
      return <h3 className={`text-white tracking-tight ${cls}`}>{d.texto}</h3>
    }

    // ── Texto ──
    case "texto":
      if (editing) {
        return (
          <AutoTextarea
            value={d.texto || ""}
            onChange={(v) => set("texto", v)}
            placeholder="Escreva o parágrafo…"
            className="text-sm text-slate-300 leading-relaxed"
          />
        )
      }
      return <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{d.texto}</p>

    // ── Imagem ──
    case "imagem":
      return <BlocoImagem dados={d} editing={editing} set={set} />

    // ── Gráfico ──
    case "grafico":
      return <BlocoGrafico dados={d as GraficoDados} editing={editing} onChange={onChange} />

    // ── Callout ──
    case "callout": {
      const variante = d.variante || "info"
      const cfg = {
        info: { borda: "border-brand-400/40", bg: "bg-brand-400/5", icone: "text-brand-300", Icon: Info },
        sucesso: { borda: "border-emerald-500/40", bg: "bg-emerald-500/5", icone: "text-emerald-400", Icon: CheckCircle2 },
        alerta: { borda: "border-amber-500/40", bg: "bg-amber-500/5", icone: "text-amber-400", Icon: AlertTriangle },
      }[variante as "info" | "sucesso" | "alerta"]
      const { Icon } = cfg
      return (
        <div className={`rounded-xl border ${cfg.borda} ${cfg.bg} p-4 flex gap-3`}>
          <Icon size={18} className={`mt-0.5 shrink-0 ${cfg.icone}`} />
          <div className="flex-1 space-y-1">
            {editing && (
              <select
                value={variante}
                onChange={(e) => set("variante", e.target.value)}
                className="bg-brand-900 border border-brand-600 rounded px-2 py-0.5 text-xs text-slate-300 mb-1"
              >
                <option value="info">Info (azul)</option>
                <option value="sucesso">Sucesso (verde)</option>
                <option value="alerta">Alerta (âmbar)</option>
              </select>
            )}
            {editing ? (
              <input
                value={d.titulo || ""}
                onChange={(e) => set("titulo", e.target.value)}
                placeholder="Título do destaque (opcional)…"
                className="w-full bg-brand-900/60 border border-brand-400/30 rounded px-2 py-1 text-sm font-semibold text-white outline-none"
              />
            ) : d.titulo ? (
              <h4 className="text-sm font-semibold text-white">{d.titulo}</h4>
            ) : null}
            {editing ? (
              <AutoTextarea value={d.texto || ""} onChange={(v) => set("texto", v)} placeholder="Texto…" className="text-sm text-slate-300" />
            ) : (
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{d.texto}</p>
            )}
          </div>
        </div>
      )
    }

    // ── Métricas (KPIs) ──
    case "metricas": {
      const itens: MetricaItem[] = d.itens || []
      const setItem = (i: number, campo: string, v: string) => {
        const arr = [...itens]
        arr[i] = { ...arr[i], [campo]: v }
        set("itens", arr)
      }
      return (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {itens.map((m, i) => (
              <div key={i} className="bg-gradient-to-br from-brand-700/60 to-brand-800 border border-brand-600 rounded-xl p-4 text-center">
                {editing ? (
                  <>
                    <input value={m.valor} onChange={(e) => setItem(i, "valor", e.target.value)}
                      className="w-full bg-transparent text-center text-xl font-bold text-white outline-none border-b border-brand-600 mb-1" />
                    <input value={m.label} onChange={(e) => setItem(i, "label", e.target.value)}
                      className="w-full bg-transparent text-center text-[10px] uppercase tracking-wider text-slate-400 outline-none" />
                    <button onClick={() => set("itens", itens.filter((_, k) => k !== i))}
                      className="text-[10px] text-red-400/70 hover:text-red-400 mt-1">remover</button>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-bold text-white">{m.valor}</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-0.5">{m.label}</p>
                    {m.sub && <p className="text-[10px] text-slate-500 mt-0.5">{m.sub}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
          {editing && (
            <button
              onClick={() => set("itens", [...itens, { label: "Métrica", valor: "0" }])}
              className="text-xs text-brand-300 hover:text-brand-200 mt-2"
            >
              + adicionar métrica
            </button>
          )}
        </div>
      )
    }

    // ── Divisória ──
    case "divisoria":
      return <hr className="border-brand-700" />

    default:
      return <p className="text-xs text-slate-500">Bloco desconhecido: {bloco.tipo}</p>
  }
}

function HeroResumo({ dados }: { dados: Record<string, unknown> }) {
  const kpis = (dados.kpis as Array<{ label: string; valor: string; sub?: string }>) || []
  const nivel = Number(dados.nivel_alerta || 3)
  const justificativa = String(dados.justificativa || "")
  const nivelCfg = nivel >= 4
    ? { label: "Atenção alta", cls: "text-red-500 bg-red-500/10 border-red-500/30" }
    : nivel === 3
      ? { label: "Atenção", cls: "text-amber-500 bg-amber-500/10 border-amber-500/30" }
      : { label: "Estável", cls: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30" }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-600 bg-brand-800 p-6 md:p-7 shadow-[var(--shadow-card)]">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-brand-300 font-bold">Belém · Resumo Executivo</p>
          <h2 className="text-3xl font-black text-white tracking-tight">{String(dados.titulo || "Resumo do Dia")}</h2>
          <p className="text-sm text-slate-500">{String(dados.subtitulo || "")}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 min-w-[150px] ${nivelCfg.cls}`}>
          <p className="text-xs uppercase tracking-widest font-bold">Nível {nivel}/5</p>
          <p className="text-lg font-bold">{nivelCfg.label}</p>
        </div>
      </div>

      {justificativa && (
        <p className="mt-5 text-base text-slate-300 leading-relaxed max-w-4xl">{justificativa}</p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-brand-600 bg-brand-900/50 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">{kpi.label}</p>
            <p className="text-2xl font-black text-white mt-1">{kpi.valor}</p>
            {kpi.sub && <p className="text-xs text-slate-500 mt-1">{kpi.sub}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

function SentimentoPainel({ dados }: { dados: Record<string, unknown> }) {
  const total = Number(dados.total || 0)
  const positivas = Number(dados.positivas || 0)
  const negativas = Number(dados.negativas || 0)
  const neutras = Number(dados.neutras || 0)
  const plataformas = (dados.plataformas as Array<{ nome: string; total: number }>) || []
  const score = Number(dados.score || 0)
  const posPct = pct(positivas, total)
  const negPct = pct(negativas, total)
  const neuPct = pct(neutras, total)
  const gaugeValue = scoreParaGauge(score)
  const zona = zonaSentimento(gaugeValue)
  const option = {
    backgroundColor: "transparent",
    series: [{
      type: "gauge",
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      center: ["50%", "62%"],
      radius: "92%",
      axisLine: {
        roundCap: true,
        lineStyle: {
          width: 20,
          color: [
            [0.2, "#dc2626"],
            [0.4, "#ea580c"],
            [0.6, "#ca8a04"],
            [0.8, "#16a34a"],
            [1.0, "#15803d"],
          ],
        },
      },
      splitLine: { show: true, length: 18, distance: -20, splitNumber: 5, lineStyle: { color: "#0a1628", width: 3 } },
      axisTick: { show: false },
      axisLabel: { show: false },
      pointer: { length: "62%", width: 7, itemStyle: { color: "#f8fafc", shadowBlur: 8, shadowColor: "rgba(0,0,0,0.45)" } },
      anchor: { show: true, size: 13, showAbove: true, itemStyle: { color: "#f8fafc", borderWidth: 2, borderColor: "#1e3a5f" } },
      title: { show: false },
      detail: { show: false },
      data: [{ value: gaugeValue }],
    }],
  }

  return (
    <section className="rounded-2xl border border-brand-600 bg-brand-800 p-5 md:p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Clima digital</p>
          <h3 className="text-xl font-black text-white">{String(dados.titulo || "Clima político")}</h3>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${score >= 0 ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10"}`}>
          {score >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          {score > 0 ? "+" : ""}{score}% score
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-center">
        <div className="flex flex-col items-center">
          <div className="w-full" style={{ height: 190 }}>
            <ReactECharts option={option} style={{ height: 190 }} />
          </div>
          <div className="rounded-full border px-4 py-1.5 text-sm font-black -mt-5" style={{ color: zona.color, borderColor: `${zona.color}66`, backgroundColor: `${zona.color}18` }}>
            {zona.label}
          </div>
          <p className="text-xs text-slate-500 mt-2">{zona.desc}</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Positivas" valor={fmt(positivas)} sub={`${posPct}% do total`} cls="text-emerald-500" />
            <MiniStat label="Neutras" valor={fmt(neutras)} sub={`${neuPct}% do total`} cls="text-slate-500" />
            <MiniStat label="Negativas" valor={fmt(negativas)} sub={`${negPct}% do total`} cls="text-red-500" />
          </div>
          <div className="rounded-xl border border-brand-600 bg-brand-900/50 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Metodologia</p>
            <p className="text-sm text-slate-300 mt-1">
              Score = (positivas - negativas) / total x 100. O ponteiro converte esse score para a escala 0-100 do clima político.
            </p>
            <div className="h-3 rounded-full overflow-hidden bg-brand-800 border border-brand-600 mt-3">
              <div className="h-full bg-emerald-500 inline-block" style={{ width: `${posPct}%` }} />
              <div className="h-full bg-slate-400 inline-block" style={{ width: `${neuPct}%` }} />
              <div className="h-full bg-red-500 inline-block" style={{ width: `${negPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {plataformas.length > 0 && (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-2">
          {plataformas.slice(0, 4).map((p) => (
            <div key={p.nome} className="flex items-center justify-between rounded-lg bg-brand-900/50 border border-brand-600 px-3 py-2">
              <span className="text-sm text-slate-300">{p.nome}</span>
              <span className="text-sm font-bold text-white">{fmt(Number(p.total || 0))}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function MiniStat({ label, valor, sub, cls }: { label: string; valor: string; sub?: string; cls: string }) {
  return (
    <div className="rounded-xl border border-brand-600 bg-brand-900/50 p-3">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-lg font-black mt-1 ${cls}`}>{valor}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function TemasPrincipais({ dados }: { dados: Record<string, unknown> }) {
  const principal = (dados.principal as Record<string, unknown>) || {}
  const secundarios = (dados.secundarios as Array<Record<string, unknown>>) || []
  const temas = [
    ...(principal.titulo ? [{ ...principal, destaque: true }] : []),
    ...secundarios,
  ]
  if (!temas.length) return null

  return (
    <section className="rounded-2xl border border-brand-600 bg-brand-800 p-5 md:p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-brand-400/10 border border-brand-400/30 flex items-center justify-center">
          <BarChart3 size={15} className="text-brand-300" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Principais temas</p>
          <h3 className="text-xl font-black text-white">{String(dados.titulo || "Narrativas do período")}</h3>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {temas.slice(0, 5).map((tema, i) => {
          const destaque = Boolean(tema.destaque)
          const total = Number(tema.total || tema.mencoes || 0)
          const positivas = Number(tema.positivas || 0)
          const negativas = Number(tema.negativas || 0)
          const pctPositivo = Number(tema.pct_positivo || 0)
          const pctNegativo = Number(tema.pct_negativo || 0)
          const pctNeutro = Math.max(0, 100 - pctPositivo - pctNegativo)
          const temDistribuicao = pctPositivo > 0 || pctNegativo > 0 || positivas > 0 || negativas > 0
          return (
            <article key={`${String(tema.titulo || tema.nome || "")}-${i}`} className={`rounded-xl border p-4 ${destaque ? "border-brand-400/50 bg-brand-400/10" : "border-brand-600 bg-brand-900/50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-xs font-mono text-slate-600 w-5 pt-1">#{i + 1}</span>
                  <div className="min-w-0">
                    <h4 className={`font-black text-white ${destaque ? "text-lg" : "text-base"}`}>{String(tema.titulo || tema.nome || "Tema")}</h4>
                    {Boolean(tema.descricao) && <p className="text-sm text-slate-300 leading-relaxed mt-1">{String(tema.descricao)}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {total > 0 && <span className="text-xs font-mono text-slate-400">{fmt(total)} menções</span>}
                  {Boolean(tema.tendencia) && (
                    <span className="rounded-full border border-brand-400/30 bg-brand-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold text-brand-300">
                      {String(tema.tendencia)}
                    </span>
                  )}
                </div>
              </div>
              {temDistribuicao && (
                <>
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-brand-700 mt-3">
                    <div style={{ width: `${pctPositivo || pct(positivas, total)}%` }} className="bg-green-500 transition-all" />
                    <div style={{ width: `${pctNeutro}%` }} className="bg-blue-500/40 transition-all" />
                    <div style={{ width: `${pctNegativo || pct(negativas, total)}%` }} className="bg-red-500 transition-all" />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-600 mt-2">
                    <span className="text-green-500">{positivas} pos.</span>
                    <span className="text-red-500">{negativas} neg.</span>
                  </div>
                </>
              )}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                {Boolean(tema.alcance) && <span>Alcance <b className="text-slate-300">{String(tema.alcance)}</b></span>}
                {Boolean(tema.interacoes) && <span>Interações <b className="text-slate-300">{String(tema.interacoes)}</b></span>}
                {Boolean(tema.polaridade) && <span>Polaridade <b className="text-slate-300">{String(tema.polaridade)}</b></span>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PerformanceOficial({ dados }: { dados: Record<string, unknown> }) {
  const contas = (dados.contas as Array<Record<string, unknown>>) || []
  return (
    <section className="rounded-2xl border border-brand-600 bg-brand-800 p-5 md:p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-brand-400/10 border border-brand-400/30 flex items-center justify-center">
          <TrendingUp size={15} className="text-brand-300" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Canais oficiais</p>
          <h3 className="text-xl font-black text-white">{String(dados.titulo || "Performance dos Canais Oficiais")}</h3>
        </div>
      </div>
      <div className="space-y-4">
        {contas.map((conta) => {
          const perfil = (conta.perfil || {}) as Record<string, number>
          const postagens = (conta.postagens || {}) as Record<string, number>
          const crescimento = (conta.crescimento || {}) as Record<string, { pct: number | null; delta: number }>
          const metricas = [
            { label: "Seguidores", valor: fmt(Number(perfil.seguidores || 0)), delta: crescimento.seguidores },
            { label: conta.rede === "Instagram" ? "Alcance" : "Impressões", valor: fmt(Number((conta.rede === "Instagram" ? perfil.alcance : perfil.impressoes) || 0)), delta: crescimento.alcance_ou_impressoes },
            { label: "Engajamento", valor: fmt(Number(postagens.engajamento_total || 0)), delta: crescimento.engajamento },
            { label: "Posts", valor: fmt(Number(postagens.total_posts || 0)), delta: crescimento.posts },
          ]
          const chartData = [
            { name: "Likes", value: Number(postagens.likes || 0) },
            { name: "Comentários", value: Number(postagens.comentarios || 0) },
            { name: "Compart.", value: Number(postagens.compartilhamentos || 0) },
            {
              name: "Outras",
              value: Number(postagens.salvos || 0) + Number(postagens.love || 0) + Number(postagens.haha || 0) +
                Number(postagens.wow || 0) + Number(postagens.sad || 0) + Number(postagens.angry || 0),
            },
          ]
          const option = {
            backgroundColor: "transparent",
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
            grid: { top: 12, left: 8, right: 8, bottom: 8, containLabel: true },
            xAxis: { type: "value", axisLabel: { color: "#64748b", fontSize: 10 }, splitLine: { lineStyle: { color: "#1e3a5f40" } } },
            yAxis: { type: "category", data: chartData.map((d) => d.name), axisLabel: { color: "#94a3b8", fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
            series: [{ type: "bar", data: chartData.map((d) => d.value), barWidth: 14, itemStyle: { color: "#38bdf8", borderRadius: [0, 5, 5, 0] } }],
          }
          return (
            <div key={`${conta.rede}-${conta.id}`} className="rounded-xl border border-brand-600 bg-brand-900/40 p-4">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <RedeBadge rede={String(conta.rede || "")} />
                    <div>
                      <p className="text-lg font-black text-white">{String(conta.rede || "")}</p>
                      <p className="text-sm text-slate-500">{String(conta.nome || "")}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {metricas.map((m) => (
                      <div key={m.label} className="rounded-md border border-brand-600/70 bg-brand-800/70 p-3">
                        <p className="text-xs uppercase tracking-wide text-slate-500">{m.label}</p>
                        <p className="text-2xl font-bold text-white tracking-tight">{m.valor}</p>
                        {m.delta && <p className={`text-sm font-medium ${deltaClass(m.delta)}`}>{deltaText(m.delta)} vs período anterior</p>}
                      </div>
                    ))}
                  </div>
                  {String(conta.rede || "") === "Facebook" && (
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                      <span>+{fmt(Number(perfil.follows || 0))} follows</span>
                      <span>-{fmt(Number(perfil.unfollows || 0))} unfollows</span>
                      <span>{fmt(Number(perfil.views || 0))} views</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <ReactECharts option={option} style={{ height: 190 }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RedeBadge({ rede }: { rede: string }) {
  if (rede === "Instagram") {
    return <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#515bd4] flex items-center justify-center text-white font-black">◎</div>
  }
  return <div className="w-10 h-10 rounded-xl bg-[#1877f2] flex items-center justify-center text-white font-black text-2xl">f</div>
}

function TopPosts({ dados }: { dados: Record<string, unknown> }) {
  const posts = (dados.posts as Array<Record<string, unknown>>) || []
  if (!posts.length) return null
  return (
    <section className="rounded-2xl border border-brand-600 bg-brand-800 p-5 md:p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-8 h-8 rounded-lg bg-brand-400/10 border border-brand-400/30 flex items-center justify-center">
          <MessageCircle size={15} className="text-brand-300" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Top posts oficiais</p>
          <h3 className="text-xl font-black text-white">{String(dados.titulo || "Top posts")}</h3>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {posts.slice(0, 6).map((post) => {
          const rede = String(post.rede || "")
          const link = String(post.link || "")
          const embedUrl = postEmbedUrl(link, rede)
          return (
          <div key={`${rede}-${String(post.id || "")}`} className="overflow-hidden rounded-lg border border-brand-600 bg-brand-900/40">
            <div className="flex h-32">
              {post.thumbnail ? (
                <img src={resolverImagem(String(post.thumbnail))} alt="" className="w-28 h-full object-cover bg-brand-700 shrink-0" crossOrigin="anonymous" />
              ) : embedUrl ? (
                <div className="w-28 h-full bg-brand-700 overflow-hidden relative shrink-0">
                  <iframe
                    src={embedUrl}
                    title={String(post.texto || post.link || "")}
                    className="absolute top-0 left-0 border-0 bg-white pointer-events-none"
                    style={{ width: 326, height: 460, transform: "scale(0.36)", transformOrigin: "top left" }}
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                </div>
              ) : (
                <div className="w-28 h-full bg-brand-700 shrink-0 flex items-center justify-center text-slate-500">
                  <MessageCircle size={22} />
                </div>
              )}
              <div className="p-3 min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] rounded-full bg-brand-400/10 text-brand-300 border border-brand-400/30 px-2 py-0.5">{String(post.rede || "")}</span>
                  <span className="text-xs text-slate-500 truncate">{String(post.tipo || "Post")}</span>
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="ml-auto text-slate-500 hover:text-brand-300 shrink-0">
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
                <p className="text-sm text-slate-300 line-clamp-2">{String(post.texto || "(sem texto)")}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                  <span className="font-black text-white">{fmt(Number(post.engajamento || 0))} eng.</span>
                  <span>{fmt(Number(post.likes || 0))} likes</span>
                  <span>{fmt(Number(post.comentarios || 0))} com.</span>
                </div>
              </div>
            </div>
          </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Textarea com auto-resize ──
function AutoTextarea({ value, onChange, placeholder, className = "" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
        e.target.style.height = "auto"
        e.target.style.height = e.target.scrollHeight + "px"
      }}
      ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px" } }}
      placeholder={placeholder}
      className={`w-full bg-brand-900/60 border border-brand-400/40 rounded-lg px-3 py-2 outline-none focus:border-brand-300 resize-none ${className}`}
    />
  )
}

// ── Imagem com upload ──
function BlocoImagem({ dados, editing, set }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dados: any; editing: boolean; set: (c: string, v: unknown) => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setEnviando(true); setErro("")
    try {
      const { url } = await reportsApi.uploadImagem(file)
      set("url", url)
    } catch {
      setErro("Falha no upload")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <figure className="space-y-2">
      {dados.url ? (
        <img src={resolverImagem(dados.url)} alt={dados.legenda || ""} crossOrigin="anonymous"
          className="w-full rounded-xl border border-brand-600" />
      ) : (
        <div className="w-full h-40 rounded-xl border border-dashed border-brand-600 flex items-center justify-center text-slate-600 text-sm">
          {editing ? "Envie uma imagem abaixo" : "Sem imagem"}
        </div>
      )}
      {editing && (
        <div className="space-y-1.5">
          <label className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-slate-200 cursor-pointer transition-colors">
            {enviando ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
            {dados.url ? "Trocar imagem" : "Enviar imagem"}
            <input type="file" accept="image/*" onChange={escolher} className="hidden" />
          </label>
          {erro && <span className="text-xs text-red-400 ml-2">{erro}</span>}
          <input
            value={dados.legenda || ""}
            onChange={(e) => set("legenda", e.target.value)}
            placeholder="Legenda (opcional)…"
            className="w-full bg-brand-900/60 border border-brand-400/30 rounded px-2 py-1 text-xs text-slate-300 outline-none"
          />
        </div>
      )}
      {!editing && dados.legenda && (
        <figcaption className="text-xs text-slate-500 text-center">{dados.legenda}</figcaption>
      )}
    </figure>
  )
}

// ── Gráfico (ECharts) ──
function BlocoGrafico({ dados, editing, onChange }: {
  dados: GraficoDados; editing: boolean; onChange: (d: GraficoDados) => void
}) {
  const variante = dados.variante || "bar"
  const categorias = dados.categorias || []
  const series = dados.series || []

  const option = variante === "pie"
    ? {
        backgroundColor: "transparent",
        tooltip: { trigger: "item" },
        legend: { textStyle: { color: "#94a3b8" }, bottom: 0 },
        series: [{
          type: "pie", radius: ["40%", "70%"],
          data: categorias.map((c, i) => ({ name: c, value: (series[0]?.dados || [])[i] ?? 0 })),
          label: { color: "#cbd5e1" },
        }],
        color: CORES,
      }
    : {
        backgroundColor: "transparent",
        tooltip: { trigger: "axis" },
        legend: { textStyle: { color: "#94a3b8" }, top: 0 },
        grid: { top: 30, bottom: 24, left: 8, right: 12, containLabel: true },
        xAxis: { type: "category", data: categorias, axisLabel: { color: "#64748b", fontSize: 11 }, axisLine: { lineStyle: { color: "#1e3a5f" } } },
        yAxis: { type: "value", axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "#1e3a5f40" } } },
        series: series.map((s, i) => ({
          name: s.nome, type: variante, data: s.dados,
          itemStyle: { color: CORES[i % CORES.length] },
          smooth: variante === "line",
        })),
        color: CORES,
      }

  return (
    <div className="rounded-xl border border-brand-600 bg-brand-800/40 p-4 space-y-2">
      {editing ? (
        <input
          value={dados.titulo || ""}
          onChange={(e) => onChange({ ...dados, titulo: e.target.value })}
          placeholder="Título do gráfico…"
          className="w-full bg-brand-900/60 border border-brand-400/30 rounded px-2 py-1 text-sm font-semibold text-white outline-none"
        />
      ) : dados.titulo ? (
        <h4 className="text-sm font-semibold text-white">{dados.titulo}</h4>
      ) : null}

      <ReactECharts option={option} style={{ height: 260 }} notMerge />

      {editing && <GraficoEditor dados={dados} onChange={onChange} />}
    </div>
  )
}

// ── Editor de gráfico em grade (prático) ──
const VARIANTES: { v: GraficoDados["variante"]; label: string; Icon: typeof BarChart3 }[] = [
  { v: "bar", label: "Barra", Icon: BarChart3 },
  { v: "line", label: "Linha", Icon: LineChartIcon },
  { v: "pie", label: "Pizza", Icon: PieChartIcon },
]

function GraficoEditor({ dados, onChange }: { dados: GraficoDados; onChange: (d: GraficoDados) => void }) {
  const categorias = dados.categorias || []
  const series = dados.series || []
  const variante = dados.variante || "bar"

  const setCategoria = (i: number, v: string) => {
    const cats = [...categorias]; cats[i] = v; onChange({ ...dados, categorias: cats })
  }
  const setValor = (ci: number, si: number, v: string) => {
    const arr = series.map((s) => ({ ...s, dados: [...s.dados] }))
    arr[si].dados[ci] = Number(v) || 0
    onChange({ ...dados, series: arr })
  }
  const setSerieNome = (si: number, v: string) => {
    const arr = [...series]; arr[si] = { ...arr[si], nome: v }; onChange({ ...dados, series: arr })
  }
  const addCategoria = () => onChange({
    ...dados,
    categorias: [...categorias, `Item ${categorias.length + 1}`],
    series: series.map((s) => ({ ...s, dados: [...s.dados, 0] })),
  })
  const removeCategoria = (i: number) => onChange({
    ...dados,
    categorias: categorias.filter((_, k) => k !== i),
    series: series.map((s) => ({ ...s, dados: s.dados.filter((_, k) => k !== i) })),
  })
  const addSerie = () => onChange({ ...dados, series: [...series, { nome: `Série ${series.length + 1}`, dados: categorias.map(() => 0) }] })
  const removeSerie = (si: number) => onChange({ ...dados, series: series.filter((_, k) => k !== si) })

  const ehPizza = variante === "pie"

  return (
    <div className="space-y-3 border-t border-brand-700 pt-3">
      {/* Tipo de gráfico — botões */}
      <div className="flex items-center gap-1.5">
        {VARIANTES.map(({ v, label, Icon }) => (
          <button key={v} onClick={() => onChange({ ...dados, variante: v })}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${variante === v ? "bg-brand-400 border-brand-400 text-white" : "bg-brand-900/60 border-brand-600 text-slate-300 hover:border-brand-500"}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
        {ehPizza && <span className="text-[10px] text-slate-500 ml-1">pizza usa só a 1ª série</span>}
      </div>

      {/* Grade de dados */}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="text-left text-slate-500 font-medium px-2 py-1">Categoria</th>
              {series.map((s, si) => (
                <th key={si} className="px-1 py-1">
                  <div className="flex items-center gap-1">
                    <input value={s.nome} onChange={(e) => setSerieNome(si, e.target.value)}
                      className="w-24 bg-brand-900/60 border border-brand-600 rounded px-1.5 py-0.5 text-slate-200 outline-none" />
                    {!ehPizza && series.length > 1 && (
                      <button onClick={() => removeSerie(si)} className="text-slate-600 hover:text-red-400"><X size={11} /></button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categorias.map((c, ci) => (
              <tr key={ci}>
                <td className="px-1 py-0.5">
                  <input value={c} onChange={(e) => setCategoria(ci, e.target.value)}
                    className="w-32 bg-brand-900/60 border border-brand-600 rounded px-1.5 py-0.5 text-slate-200 outline-none" />
                </td>
                {series.map((s, si) => (
                  <td key={si} className="px-1 py-0.5">
                    <input type="number" value={s.dados[ci] ?? 0} onChange={(e) => setValor(ci, si, e.target.value)}
                      className="w-20 bg-brand-900/60 border border-brand-600 rounded px-1.5 py-0.5 text-slate-200 outline-none" />
                  </td>
                ))}
                <td className="pl-1">
                  <button onClick={() => removeCategoria(ci)} className="text-slate-600 hover:text-red-400" title="Remover linha"><X size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button onClick={addCategoria} className="text-xs text-brand-300 hover:text-brand-200">+ categoria</button>
        {!ehPizza && <button onClick={addSerie} className="text-xs text-brand-300 hover:text-brand-200">+ série</button>}
      </div>
    </div>
  )
}
