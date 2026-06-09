import ReactECharts from "echarts-for-react"
import {
  Info, CheckCircle2, AlertTriangle, ImagePlus, Loader2, X,
  BarChart3, LineChart as LineChartIcon, PieChart as PieChartIcon,
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

export function BlocoView({ bloco, editing, onChange }: Props) {
  const d = bloco.dados || {}
  const set = (campo: string, valor: unknown) => onChange({ ...d, [campo]: valor })

  switch (bloco.tipo) {
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
