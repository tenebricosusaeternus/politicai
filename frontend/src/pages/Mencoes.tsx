import { useEffect, useState } from "react"
import { format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { dashboardApi } from "../api/dashboard"
import type { Mencao, Sentimento } from "../api/dashboard"
import { Card } from "../components/ui/Card"
import {
  Calendar,
  ExternalLink,
  ThumbsUp,
  Share2,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RotateCcw,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Trash2,
} from "lucide-react"

type SentimentoBtn = { value: Sentimento; label: string; style: string; active: string }
const SENTIMENTO_BTNS: SentimentoBtn[] = [
  {
    value: "POSITIVA",
    label: "Positivo",
    style: "text-green-400 border-green-500/40 hover:bg-green-500/10",
    active: "bg-green-500/20 text-green-400 border-green-500",
  },
  {
    value: "NEGATIVA",
    label: "Negativo",
    style: "text-red-400 border-red-500/40 hover:bg-red-500/10",
    active: "bg-red-500/20 text-red-400 border-red-500",
  },
  {
    value: "IRRELEVANTE",
    label: "Irrelevante",
    style: "text-slate-400 border-slate-500/40 hover:bg-slate-500/10",
    active: "bg-slate-500/20 text-slate-400 border-slate-500",
  },
]

const SENTIMENTO_STYLE: Record<string, string> = {
  POSITIVA: "text-green-400 bg-green-400/10 border-green-400/30",
  NEGATIVA: "text-red-400 bg-red-400/10 border-red-400/30",
  NEUTRA: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  IRRELEVANTE: "text-slate-500 bg-slate-500/10 border-slate-500/30",
  SEM_QUALIFICACAO: "text-slate-400 bg-slate-400/10 border-slate-400/30",
}
const SENTIMENTO_LABEL: Record<string, string> = {
  POSITIVA: "Positivo",
  NEGATIVA: "Negativo",
  NEUTRA: "Neutro",
  IRRELEVANTE: "Irrelevante",
  SEM_QUALIFICACAO: "—",
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function DetalhePanel({
  selected,
  salvando,
  feedback,
  onCorrigir,
  onRemover,
  onBack,
}: {
  selected: Mencao
  salvando: boolean
  feedback: string | null
  onCorrigir: (s: Sentimento) => void
  onRemover: () => void
  onBack?: () => void
}) {
  return (
    <Card>
      <div className="space-y-4">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-2 lg:hidden"
          >
            <ArrowLeft size={14} />
            Voltar à lista
          </button>
        )}

        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">
              {selected.plataforma || "Plataforma desconhecida"}
            </p>
            <p className="text-base text-slate-300 font-medium">{selected.publicador_nome || "—"}</p>
            {selected.data && (
              <p className="text-sm text-slate-600">
                {format(new Date(selected.data), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {selected.link && (
              <a
                href={selected.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-brand-300 hover:text-white transition-colors"
              >
                <ExternalLink size={12} />
                Ver original
              </a>
            )}
          </div>
        </div>

        {/* Texto */}
        <p className="text-base text-slate-200 leading-7 border-l-2 border-brand-600 pl-4">
          {selected.texto || "(sem texto)"}
        </p>

        {/* Engajamento */}
        {(selected.likes > 0 || selected.shares > 0 || selected.comentarios > 0) && (
          <div className="flex items-center gap-4 text-sm text-slate-500">
            {selected.likes > 0 && (
              <span className="flex items-center gap-1">
                <ThumbsUp size={11} /> {fmt(selected.likes)}
              </span>
            )}
            {selected.shares > 0 && (
              <span className="flex items-center gap-1">
                <Share2 size={11} /> {fmt(selected.shares)}
              </span>
            )}
            {selected.comentarios > 0 && (
              <span className="flex items-center gap-1">
                <MessageCircle size={11} /> {fmt(selected.comentarios)}
              </span>
            )}
          </div>
        )}

        {/* Sentimento atual */}
        <div className="space-y-1.5">
          <p className="text-sm text-slate-500 uppercase tracking-wider">Sentimento</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm px-2.5 py-1.5 rounded-lg border ${SENTIMENTO_STYLE[selected.sentimento] || SENTIMENTO_STYLE.SEM_QUALIFICACAO}`}>
              {SENTIMENTO_LABEL[selected.sentimento] || selected.sentimento}
            </span>
            {selected.corrigido && selected.source === "llm_auto" && (
              <span className="text-xs text-violet-400 flex items-center gap-1">
                <Sparkles size={11} />IA
              </span>
            )}
            {selected.corrigido && selected.source === "manual" && (
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <Pencil size={11} />manual
              </span>
            )}
            {selected.corrigido && (
              <span className="text-xs text-slate-600">
                V-Tracker: {SENTIMENTO_LABEL[selected.sentimento_vtracker] || selected.sentimento_vtracker}
              </span>
            )}
          </div>
        </div>

        {/* Correção manual */}
        <div className="space-y-2">
          <p className="text-sm text-slate-500 uppercase tracking-wider">Corrigir</p>
          <div className="flex flex-wrap gap-2">
            {SENTIMENTO_BTNS.map((btn) => (
              <button
                key={btn.value}
                onClick={() => onCorrigir(btn.value)}
                disabled={salvando}
                className={`text-sm px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 ${
                  selected.sentimento === btn.value ? btn.active : btn.style
                }`}
              >
                {btn.label}
              </button>
            ))}
            {selected.corrigido && (
              <button
                onClick={onRemover}
                disabled={salvando}
                className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg border border-slate-600 text-slate-500 hover:text-red-400 hover:border-red-500/40 transition-colors disabled:opacity-50"
              >
                <RotateCcw size={11} />
                Reverter
              </button>
            )}
          </div>
          {feedback && (
            <p className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle2 size={12} />
              {feedback}
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

export function Mencoes() {
  const hoje = new Date()
  const [dataInicio, setDataInicio] = useState(format(subDays(hoje, 6), "yyyy-MM-dd"))
  const [dataFim, setDataFim] = useState(format(hoje, "yyyy-MM-dd"))
  const [pagina, setPagina] = useState(0)
  const [mencoes, setMencoes] = useState<Mencao[]>([])
  const [total, setTotal] = useState(0)
  const [paginas, setPaginas] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState("")
  const [selected, setSelected] = useState<Mencao | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [reclassificando, setReclassificando] = useState(false)
  const [limpando, setLimpando] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [mostrarIrrelevantes, setMostrarIrrelevantes] = useState(false)

  function load(p = 0, incluirIrrelevantes = mostrarIrrelevantes) {
    setLoading(true)
    setErro("")
    setPagina(p)
    dashboardApi
      .mencoesRecentes({
        monitoramento: "todos",
        dataInicio,
        dataFim,
        pagina: p,
        tamanho: 20,
        incluirIrrelevantes,
      })
      .then((r) => {
        setMencoes(r.items)
        setTotal(r.total)
        setPaginas(r.paginas)
        setSelected(null)
      })
      .catch((e) => setErro(e?.response?.data?.detail || e.message || "Erro"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(0) }, [])

  function handleReclassificar() {
    setReclassificando(true)
    dashboardApi
      .reclassificar({ monitoramento: "todos", dataInicio, dataFim, paginas: 3 })
      .then((r) => {
        showFeedback(`✓ ${r.mensagem}`)
        load(pagina)
      })
      .catch(() => showFeedback("Erro ao reclassificar"))
      .finally(() => setReclassificando(false))
  }

  function handleLimparReclassificar() {
    if (!confirm("Isso apagará todas as classificações automáticas anteriores e reclassificará do zero (últimos 30 dias). Continuar?")) return
    setLimpando(true)
    dashboardApi
      .limparReclassificar({ dataInicio, dataFim, paginas: 5 })
      .then((r) => {
        showFeedback(`✓ ${r.mensagem}`)
        load(0)
      })
      .catch(() => showFeedback("Erro na limpeza"))
      .finally(() => setLimpando(false))
  }

  function showFeedback(msg: string) {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), 3000)
  }

  function handleCorrigir(sentimento: Sentimento) {
    if (!selected) return
    setSalvando(true)
    dashboardApi
      .corrigirSentimento(selected.id, sentimento, {
        monitoramentoId: selected.monitoramento_id ?? 1853,
        textoSnapshot: selected.texto,
        plataforma: selected.plataforma,
        publicadorNome: selected.publicador_nome,
        sentimentoVtracker: selected.sentimento_vtracker,
        observacao: "",
      })
      .then(() => {
        const updated: Mencao = { ...selected, sentimento, corrigido: true, source: "manual" }
        setSelected(updated)
        setMencoes((prev) => prev.map((m) => (m.id === selected.id ? updated : m)))
        showFeedback("Sentimento corrigido!")
      })
      .catch(() => showFeedback("Erro ao salvar"))
      .finally(() => setSalvando(false))
  }

  function handleRemoverCorrecao() {
    if (!selected || !selected.corrigido) return
    setSalvando(true)
    dashboardApi
      .removerCorrecao(selected.id)
      .then(() => {
        const updated: Mencao = { ...selected, sentimento: selected.sentimento_vtracker, corrigido: false, source: undefined }
        setSelected(updated)
        setMencoes((prev) => prev.map((m) => (m.id === selected.id ? updated : m)))
        showFeedback("Correção removida")
      })
      .catch(() => showFeedback("Erro ao remover"))
      .finally(() => setSalvando(false))
  }

  return (
    <div className="p-4 md:p-8 space-y-5 max-w-[1800px] mx-auto">

      {/* ── Filtros ── */}
      <div className="space-y-3">
        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Menções</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 flex-1 min-w-[160px] shadow-[var(--shadow-card)]">
            <Calendar size={16} className="text-slate-400 flex-shrink-0" />
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-full"
            />
          </div>
          <div className="flex items-center gap-2 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 flex-1 min-w-[160px] shadow-[var(--shadow-card)]">
            <Calendar size={16} className="text-slate-400 flex-shrink-0" />
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-full"
            />
          </div>
          <button
            onClick={() => load(0)}
            disabled={loading}
            className="bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-white text-base font-semibold px-5 py-3 rounded-lg transition-colors whitespace-nowrap shadow-sm"
          >
            {loading ? "..." : "Filtrar"}
          </button>
          <label className="flex items-center gap-2 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 text-base text-slate-300 cursor-pointer shadow-[var(--shadow-card)]">
            <input
              type="checkbox"
              checked={mostrarIrrelevantes}
              onChange={(e) => {
                const checked = e.target.checked
                setMostrarIrrelevantes(checked)
                setPagina(0)
                load(0, checked)
              }}
              className="accent-brand-400"
            />
            Mostrar irrelevantes
          </label>
          <button
            onClick={handleReclassificar}
            disabled={reclassificando || loading || limpando}
            className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-base font-semibold px-5 py-3 rounded-lg transition-colors whitespace-nowrap shadow-sm"
            title="Reclassifica as menções do período usando o Qwen local"
          >
            <Sparkles size={14} />
            {reclassificando ? "Classificando..." : "IA: Reclassificar"}
          </button>
          <button
            onClick={handleLimparReclassificar}
            disabled={limpando || reclassificando || loading}
            className="flex items-center gap-2 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-base font-semibold px-5 py-3 rounded-lg transition-colors whitespace-nowrap shadow-sm"
            title="Apaga todas as classificações IA e reclassifica do zero (últimos 30 dias)"
          >
            <Trash2 size={14} />
            {limpando ? "Limpando..." : "Limpar e Reclassificar"}
          </button>
        </div>
        {feedback && (
          <p className="text-sm text-green-400 flex items-center gap-1.5">
            <CheckCircle2 size={12} />{feedback}
          </p>
        )}
      </div>

      {erro && <p className="text-red-400 text-sm">{erro}</p>}

      {/* Mobile: detalhe cobre a lista */}
      {selected && (
        <div className="lg:hidden">
          <DetalhePanel
            selected={selected}
            salvando={salvando}
            feedback={feedback}
            onCorrigir={handleCorrigir}
            onRemover={handleRemoverCorrecao}
            onBack={() => setSelected(null)}
          />
        </div>
      )}

      {/* Desktop: lista (2 cols) + detalhe (3 cols) */}
      <div className={`lg:grid lg:grid-cols-5 lg:gap-4 ${selected ? "hidden lg:grid" : ""}`}>
        {/* Lista */}
        <div className="lg:col-span-2 space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-sm text-slate-500 uppercase tracking-wider">
              {loading ? "Carregando..." : `${fmt(total)} menções`}
            </p>
            {paginas > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => load(pagina - 1)}
                  disabled={pagina === 0 || loading}
                  className="p-1 rounded hover:bg-brand-700 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={14} className="text-slate-400" />
                </button>
                <span className="text-sm text-slate-500">{pagina + 1}/{paginas}</span>
                <button
                  onClick={() => load(pagina + 1)}
                  disabled={pagina >= paginas - 1 || loading}
                  className="p-1 rounded hover:bg-brand-700 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={14} className="text-slate-400" />
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-brand-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : mencoes.length === 0 ? (
            <p className="text-slate-500 text-sm px-1">Sem menções no período.</p>
          ) : (
            <div className="space-y-1.5 lg:max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              {mencoes.map((m) => (
                <button
                  key={`${m.id}-${m.monitoramento_id}`}
                  onClick={() => setSelected(m)}
                  className={`w-full text-left p-4 rounded-lg border transition-colors shadow-[var(--shadow-card)] ${
                    m.sentimento === "IRRELEVANTE"
                      ? "opacity-40 hover:opacity-70"
                      : ""
                  } ${
                    selected?.id === m.id && selected?.monitoramento_id === m.monitoramento_id
                      ? "bg-brand-600 border-brand-400"
                      : "bg-brand-800 border-brand-600 hover:bg-brand-700"
                  }`}
                >
                  <p className="text-base text-slate-200 line-clamp-2 leading-6">{m.texto || "(sem texto)"}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-sm px-2 py-0.5 rounded border ${SENTIMENTO_STYLE[m.sentimento] || SENTIMENTO_STYLE.SEM_QUALIFICACAO}`}>
                      {SENTIMENTO_LABEL[m.sentimento] || m.sentimento}
                    </span>
                    {m.corrigido && m.source === "llm_auto" && (
                      <span className="text-xs text-violet-400 flex items-center gap-0.5">
                        <Sparkles size={10} />IA
                      </span>
                    )}
                    {m.corrigido && m.source === "manual" && (
                      <span className="text-xs text-amber-400 flex items-center gap-0.5">
                        <Pencil size={10} />manual
                      </span>
                    )}
                    <span className="text-sm text-slate-500 truncate max-w-[140px]">{m.plataforma}</span>
                    {m.data && (
                      <span className="text-sm text-slate-600">
                        {format(new Date(m.data), "dd/MM HH:mm", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detalhe — só desktop */}
        <div className="hidden lg:block lg:col-span-3">
          {selected ? (
            <DetalhePanel
              selected={selected}
              salvando={salvando}
              feedback={feedback}
              onCorrigir={handleCorrigir}
              onRemover={handleRemoverCorrecao}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
              Selecione uma menção para ver os detalhes
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
