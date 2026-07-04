import { useCallback, useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Calendar,
  ClipboardList,
  Copy,
  ExternalLink,
  Lightbulb,
  MapPin,
  MessageSquareText,
  Newspaper,
  RefreshCw,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react"
import { intelligenceApi } from "../api/intelligence"
import type {
  ActorItem,
  CrisisRoomItem,
  IntelligenceOverview,
  NarrativeItem,
  RecommendationItem,
} from "../api/intelligence"
import { Card } from "../components/ui/Card"

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function scoreClass(score: number): string {
  if (score > 15) return "text-green-400"
  if (score < -15) return "text-red-400"
  return "text-amber-400"
}

function riskClass(score: number): string {
  if (score >= 70) return "text-red-400 bg-red-500/10 border-red-500/30"
  if (score >= 45) return "text-amber-400 bg-amber-500/10 border-amber-500/30"
  return "text-blue-300 bg-blue-500/10 border-blue-500/30"
}

function priorityClass(priority: string): string {
  if (priority === "alta") return "text-red-400 bg-red-500/10 border-red-500/30"
  if (priority === "media") return "text-amber-400 bg-amber-500/10 border-amber-500/30"
  return "text-slate-300 bg-slate-500/10 border-slate-500/30"
}

function postureClass(posture: string): string {
  if (posture === "crítico") return "text-red-400 bg-red-500/10 border-red-500/30"
  if (posture === "aliado") return "text-green-400 bg-green-500/10 border-green-500/30"
  return "text-slate-300 bg-slate-500/10 border-slate-500/30"
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone ?? "text-white"}`}>{value}</p>
    </Card>
  )
}

function CrisisCard({ item }: { item: CrisisRoomItem }) {
  const nivelLabel: Record<string, string> = {
    potencial: "Potencial",
    incubacao: "Em incubação",
    instalada: "Instalada",
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{item.tema}</p>
          <p className="text-sm text-slate-500 mt-1">
            {item.mencoes} menções · {fmt(item.engajamento)} interações
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-lg border ${riskClass(item.score)}`}>
            risco {item.score}
          </span>
          {item.nivel && (
            <span className="text-xs text-slate-300 border border-brand-600 px-2.5 py-1 rounded-lg">
              {nivelLabel[item.nivel] ?? item.nivel}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {item.categoria && (
          <span className="text-xs text-slate-300 bg-brand-700 px-2 py-1 rounded">{item.categoria}</span>
        )}
        <span className="text-xs text-slate-300 bg-brand-700 px-2 py-1 rounded">{item.status}</span>
        {item.termos?.slice(0, 4).map((termo) => (
          <span key={termo} className="text-xs text-slate-400 border border-brand-600 px-2 py-1 rounded">
            {termo}
          </span>
        ))}
        {item.plataformas.map((p) => (
          <span key={p} className="text-xs text-slate-400 border border-brand-600 px-2 py-1 rounded">
            {p}
          </span>
        ))}
      </div>

      <p className="text-sm text-slate-300 leading-6 border-l-2 border-brand-500 pl-3">
        {item.resposta_sugerida}
      </p>

      <div className="space-y-2">
        {item.evidencias.map((ev) => (
          <div key={ev.id} className="bg-brand-700/50 border border-brand-600 rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-slate-300 leading-5 line-clamp-3">{ev.texto || "(sem texto)"}</p>
              {ev.link && (
                <a href={ev.link} target="_blank" rel="noopener noreferrer" className="text-brand-300 hover:text-white">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {ev.plataforma || "plataforma"} · {ev.publicador || "autor"} · {fmt(ev.engajamento)}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ActorRow({ item }: { item: ActorItem }) {
  return (
    <div className="grid grid-cols-12 gap-3 items-center py-3 border-b border-brand-600 last:border-b-0">
      <div className="col-span-5 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-200 font-medium truncate">{item.nome}</p>
          {item.link && (
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-brand-300">
              <ExternalLink size={12} />
            </a>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">{item.plataformas.join(", ") || "sem plataforma"}</p>
      </div>
      <div className="col-span-2">
        <span className={`text-xs px-2 py-1 rounded-lg border ${postureClass(item.postura)}`}>{item.postura}</span>
      </div>
      <p className="col-span-2 text-sm text-slate-400">{item.total} posts</p>
      <p className="col-span-2 text-sm text-slate-400">{fmt(item.engajamento)}</p>
      <p className={`col-span-1 text-sm font-semibold text-right ${scoreClass(item.score_sentimento)}`}>
        {item.score_sentimento}
      </p>
    </div>
  )
}

function NarrativeCard({ item }: { item: NarrativeItem }) {
  const negativePct = item.total ? Math.round((item.negativas / item.total) * 100) : 0
  const positivePct = item.total ? Math.round((item.positivas / item.total) * 100) : 0
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-white">{item.nome}</p>
          <p className="text-sm text-slate-500">{item.total} menções · {fmt(item.engajamento)} interações</p>
        </div>
        <span className={`text-sm font-semibold ${scoreClass(item.score_sentimento)}`}>
          {item.score_sentimento > 0 ? "+" : ""}{item.score_sentimento}
        </span>
      </div>
      <div className="h-2 rounded-full bg-brand-700 overflow-hidden flex">
        <div className="bg-green-500/70" style={{ width: `${positivePct}%` }} />
        <div className="bg-red-500/70" style={{ width: `${negativePct}%` }} />
      </div>
      <div className="flex flex-wrap gap-2">
        {item.termos.map((t) => (
          <span key={t} className="text-xs text-brand-200 bg-brand-700 px-2 py-1 rounded">#{t}</span>
        ))}
      </div>
    </Card>
  )
}

function RecommendationCard({ item }: { item: RecommendationItem }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold text-white">{item.acao}</p>
        <span className={`text-xs px-2 py-1 rounded-lg border ${priorityClass(item.prioridade)}`}>
          {item.prioridade}
        </span>
      </div>
      <p className="text-sm text-slate-400 leading-6">{item.motivo}</p>
      <p className="text-sm text-slate-300 leading-6 border-l-2 border-brand-500 pl-3">{item.proximo_passo}</p>
    </Card>
  )
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brand-700/50 border border-brand-600 rounded-lg p-3">
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-semibold text-white mt-1">{value}</p>
    </div>
  )
}

export function Inteligencia() {
  const hoje = new Date()
  const [dataInicio, setDataInicio] = useState(format(subDays(hoje, 6), "yyyy-MM-dd"))
  const [dataFim, setDataFim] = useState(format(hoje, "yyyy-MM-dd"))
  const [data, setData] = useState<IntelligenceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState("")
  const [copiado, setCopiado] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setErro("")
    intelligenceApi.overview({ data_inicio: dataInicio, data_fim: dataFim, monitoramento: "todos" })
      .then(setData)
      .catch((e) => setErro(e?.response?.data?.detail || e.message || "Erro ao carregar inteligência"))
      .finally(() => setLoading(false))
  }, [dataFim, dataInicio])

  useEffect(() => { load() }, [load])

  const periodoLabel = useMemo(() => {
    if (!data) return ""
    const inicio = new Date(`${data.periodo.inicio}T00:00:00`)
    const fim = new Date(`${data.periodo.fim}T00:00:00`)
    return `${format(inicio, "dd/MM", { locale: ptBR })} a ${format(fim, "dd/MM/yyyy", { locale: ptBR })}`
  }, [data])

  const copiarBriefing = () => {
    if (!data) return
    navigator.clipboard.writeText(data.briefing.whatsapp).then(() => {
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1800)
    })
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1800px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Inteligência Política</h1>
          <p className="text-sm text-slate-500 mt-1">Sala de crise, atores, narrativas, ações e briefing diário</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 shadow-[var(--shadow-card)]">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-36"
            />
          </div>
          <span className="text-slate-500 text-base">até</span>
          <div className="flex items-center gap-2 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 shadow-[var(--shadow-card)]">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-36"
            />
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 bg-brand-400 hover:bg-brand-300 text-white text-base font-semibold px-5 py-3 rounded-lg transition-colors shadow-sm"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
      </div>

      {erro && <Card><p className="text-red-400 text-sm">{erro}</p></Card>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Kpi label="Menções analisadas" value={fmt(data.briefing.kpis.total)} />
            <Kpi label="Positivas" value={fmt(data.briefing.kpis.positivas)} tone="text-green-400" />
            <Kpi label="Negativas" value={fmt(data.briefing.kpis.negativas)} tone="text-red-400" />
            <Kpi
              label={`Score · ${periodoLabel}`}
              value={`${data.briefing.kpis.score_sentimento > 0 ? "+" : ""}${data.briefing.kpis.score_sentimento}`}
              tone={scoreClass(data.briefing.kpis.score_sentimento)}
            />
          </div>

          <Card>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2 max-w-4xl">
                <div className="flex items-center gap-2 text-brand-300">
                  <ClipboardList size={18} />
                  <h2 className="text-lg font-semibold text-white">Briefing Executivo</h2>
                </div>
                <p className="text-base text-slate-300 leading-7">{data.briefing.resumo}</p>
                <p className="text-sm text-slate-500 leading-6">{data.briefing.whatsapp}</p>
              </div>
              <button
                onClick={copiarBriefing}
                className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white border border-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg transition-colors"
              >
                <Copy size={14} />
                {copiado ? "Copiado" : "Copiar WhatsApp"}
              </button>
            </div>
          </Card>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-red-400" />
              <h2 className="text-xl font-bold text-white">Sala de Crise</h2>
            </div>
            {data.crises.length === 0 ? (
              <Card>
                <p className="text-sm text-slate-500">
                  Nenhum episódio de crise municipal foi detectado no período.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {data.crises.map((item) => <CrisisCard key={item.tema} item={item} />)}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target size={18} className="text-brand-300" />
                <h2 className="text-xl font-bold text-white">Narrativas Estratégicas</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-4">
                {data.narrativas.map((item) => <NarrativeCard key={item.nome} item={item} />)}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Lightbulb size={18} className="text-amber-400" />
                <h2 className="text-xl font-bold text-white">Recomendações de Ação</h2>
              </div>
              <div className="space-y-4">
                {data.recomendacoes.map((item) => <RecommendationCard key={item.acao} item={item} />)}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-5 gap-4">
            <div className="xl:col-span-3 space-y-3">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-blue-300" />
                <h2 className="text-xl font-bold text-white">Oposição e Atores</h2>
              </div>
              <Card>
                {data.atores.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem atores recorrentes no período.</p>
                ) : (
                  <div>
                    <div className="grid grid-cols-12 gap-3 pb-2 border-b border-brand-600 text-xs text-slate-500 uppercase tracking-wider">
                      <span className="col-span-5">Ator</span>
                      <span className="col-span-2">Postura</span>
                      <span className="col-span-2">Volume</span>
                      <span className="col-span-2">Engaj.</span>
                      <span className="col-span-1 text-right">Score</span>
                    </div>
                    {data.atores.map((item) => <ActorRow key={item.nome} item={item} />)}
                  </div>
                )}
              </Card>
            </div>

            <div className="xl:col-span-2 space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-green-400" />
                <h2 className="text-xl font-bold text-white">Pulso Diário</h2>
              </div>
              <Card>
                <div className="space-y-3">
                  {data.serie.map((dia) => {
                    const total = Math.max(dia.total, 1)
                    return (
                      <div key={dia.data}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-slate-400">{format(new Date(`${dia.data}T00:00:00`), "dd/MM", { locale: ptBR })}</span>
                          <span className="text-slate-500">{dia.total}</span>
                        </div>
                        <div className="h-2 rounded-full bg-brand-700 overflow-hidden flex">
                          <div className="bg-green-500/70" style={{ width: `${(dia.positivas / total) * 100}%` }} />
                          <div className="bg-red-500/70" style={{ width: `${(dia.negativas / total) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Newspaper size={18} className="text-brand-300" />
                <h2 className="text-xl font-bold text-white">Calendário Editorial Inteligente</h2>
              </div>
              <div className="space-y-3">
                {data.calendario_editorial.map((item) => (
                  <Card key={`${item.dia}-${item.tema}`} className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-500">{item.dia} · {item.formato}</p>
                        <p className="text-base font-semibold text-white mt-1">{item.tema}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-lg border ${priorityClass(item.prioridade)}`}>
                        {item.prioridade}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 leading-6">{item.objetivo}</p>
                    <p className="text-sm text-slate-300 leading-6 border-l-2 border-brand-500 pl-3">{item.gancho}</p>
                  </Card>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquareText size={18} className="text-amber-400" />
                <h2 className="text-xl font-bold text-white">Gestão de Respostas</h2>
              </div>
              <div className="space-y-3">
                {data.gestao_respostas.map((item) => (
                  <Card key={`${item.origem}-${item.canal}`} className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-500">{item.origem}</p>
                        <p className="text-base font-semibold text-white mt-1">{item.canal}</p>
                      </div>
                      <span className="text-xs text-slate-300 bg-brand-700 px-2 py-1 rounded">{item.status}</span>
                    </div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Tom: {item.tom}</p>
                    <p className="text-sm text-slate-300 leading-6">{item.mensagem}</p>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target size={18} className="text-green-400" />
                <h2 className="text-xl font-bold text-white">Comparativo com Canais Oficiais</h2>
              </div>
              <Card className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <SmallMetric label="Posts oficiais" value={fmt(data.comparativo_oficial.posts_oficiais)} />
                  <SmallMetric label="Engajamento oficial" value={fmt(data.comparativo_oficial.engajamento_oficial)} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Termos oficiais fortes</p>
                  <div className="flex flex-wrap gap-2">
                    {data.comparativo_oficial.termos_oficiais.map((t) => (
                      <span key={t} className="text-xs text-green-300 bg-green-500/10 border border-green-500/20 px-2 py-1 rounded">#{t}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-2">Lacunas de comunicação</p>
                  {data.comparativo_oficial.lacunas.length === 0 ? (
                    <p className="text-sm text-slate-500">Sem lacunas relevantes detectadas.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.comparativo_oficial.lacunas.map((item) => (
                        <div key={item.tema} className="bg-brand-700/50 border border-brand-600 rounded-lg p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-200">{item.tema}</p>
                            <span className={scoreClass(item.sentimento)}>{item.sentimento}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{item.demanda_publica} menções públicas sem espelho forte nos canais oficiais</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-blue-300" />
                <h2 className="text-xl font-bold text-white">Mapa Territorial</h2>
              </div>
              <Card>
                {data.mapa_territorial.length === 0 ? (
                  <p className="text-sm text-slate-500">As menções do período não trouxeram localização estruturada suficiente.</p>
                ) : (
                  <div className="space-y-3">
                    {data.mapa_territorial.map((item) => (
                      <div key={item.local}>
                        <div className="flex items-center justify-between gap-3 text-sm mb-1">
                          <span className="text-slate-300 truncate">{item.local}</span>
                          <span className={scoreClass(item.score_sentimento)}>{item.score_sentimento}</span>
                        </div>
                        <div className="h-2 rounded-full bg-brand-700 overflow-hidden flex">
                          <div className="bg-green-500/70" style={{ width: `${(item.positivas / Math.max(item.total, 1)) * 100}%` }} />
                          <div className="bg-red-500/70" style={{ width: `${(item.negativas / Math.max(item.total, 1)) * 100}%` }} />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{item.total} menções · {fmt(item.engajamento)} interações</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Bot size={18} className="text-violet-300" />
              <h2 className="text-xl font-bold text-white">Auditoria da IA</h2>
            </div>
            <Card className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <SmallMetric label="Processadas" value={fmt(data.auditoria_ia.llm_processadas)} />
                <SmallMetric label="Pendentes" value={fmt(data.auditoria_ia.llm_pendentes)} />
                <SmallMetric label="Correções manuais" value={fmt(data.auditoria_ia.correcoes_manuais)} />
                <SmallMetric label="Classif. auto" value={fmt(data.auditoria_ia.classificacoes_auto)} />
                <SmallMetric label="Taxa correção" value={`${data.auditoria_ia.taxa_correcao_manual}%`} />
              </div>
              {data.auditoria_ia.divergencias.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-white mb-2">Principais divergências</p>
                  <div className="flex flex-wrap gap-2">
                    {data.auditoria_ia.divergencias.map((item) => (
                      <span key={item.par} className="text-xs text-slate-300 bg-brand-700 border border-brand-600 px-2 py-1 rounded">
                        {item.par}: {item.total}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </section>

          {data.crises.length > 0 && data.briefing.kpis.negativas > data.briefing.kpis.positivas && (
            <Card className="border-red-500/30 bg-red-500/5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-red-400 mt-0.5" size={18} />
                <p className="text-sm text-slate-300 leading-6">
                  O período tem saldo negativo e pelo menos uma crise ativa. Priorize validação das evidências antes de resposta pública.
                </p>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
