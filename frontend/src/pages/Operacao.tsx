import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import {
  Bot,
  CheckCircle2,
  ClipboardList,
  DatabaseZap,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Tags,
} from "lucide-react"
import { Card } from "../components/ui/Card"
import { useAuth } from "../store/auth"
import { operationsApi } from "../api/operations"
import type { AiAudit, CrisisCase, HygieneSummary, PoliticalEntity } from "../api/operations"

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function badgeClass(value: string): string {
  if (["alta", "critica", "crítico", "em resposta"].includes(value)) return "text-red-400 bg-red-500/10 border-red-500/30"
  if (["media", "monitorando", "planejada"].includes(value)) return "text-amber-400 bg-amber-500/10 border-amber-500/30"
  if (["resolvido", "aliado"].includes(value)) return "text-green-400 bg-green-500/10 border-green-500/30"
  return "text-slate-300 bg-slate-500/10 border-slate-500/30"
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brand-700/50 border border-brand-600 rounded-lg p-3">
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
    </div>
  )
}

export function Operacao() {
  const { role } = useAuth()
  const [hygiene, setHygiene] = useState<HygieneSummary | null>(null)
  const [crises, setCrises] = useState<CrisisCase[]>([])
  const [entities, setEntities] = useState<PoliticalEntity[]>([])
  const [audit, setAudit] = useState<AiAudit | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState("")
  const [newCrisis, setNewCrisis] = useState("")
  const [newEntity, setNewEntity] = useState("")

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      operationsApi.hygieneSummary(),
      operationsApi.listCrises(),
      operationsApi.listEntities(),
      operationsApi.aiAudit(),
    ])
      .then(([h, c, e, a]) => {
        setHygiene(h)
        setCrises(c)
        setEntities(e)
        setAudit(a)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (role !== "admin") return <Navigate to="/" replace />

  const runHygiene = () => {
    setFeedback("")
    operationsApi.runHygiene(2000).then((r) => {
      setFeedback(`Higiene executada: ${r.marcadas_irrelevantes + r.duplicadas} filtradas`)
      load()
    })
  }

  const createCrisis = () => {
    if (!newCrisis.trim()) return
    operationsApi.createCrisis({ title: newCrisis, priority: "media", status: "monitorando" }).then(() => {
      setNewCrisis("")
      load()
    })
  }

  const createEntity = () => {
    if (!newEntity.trim()) return
    operationsApi.createEntity({ name: newEntity, kind: "ator", stance: "neutro", aliases: [] }).then(() => {
      setNewEntity("")
      load()
    })
  }

  const reprocess = () => {
    operationsApi.reprocessAi(100).then((r) => {
      setFeedback(`IA reprocessou ${r.classificadas} menções; ${r.pendentes} pendentes`)
      load()
    })
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1800px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Operação</h1>
          <p className="text-sm text-slate-500 mt-1">Higiene da base, fila de crise, entidades e auditoria da IA</p>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 bg-brand-400 hover:bg-brand-300 text-white text-base font-semibold px-5 py-3 rounded-lg transition-colors shadow-sm"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {feedback && (
        <Card className="border-green-500/30 bg-green-500/5">
          <p className="text-sm text-green-400 flex items-center gap-2">
            <CheckCircle2 size={14} />
            {feedback}
          </p>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <DatabaseZap size={18} className="text-brand-300" />
                  <h2 className="text-xl font-bold text-white">Higiene Auditável</h2>
                </div>
                <button
                  onClick={runHygiene}
                  className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white border border-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg"
                >
                  <RefreshCw size={14} />
                  Rodar
                </button>
              </div>
              {hygiene && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Filtradas" value={fmt(hygiene.total_filtrado)} />
                    <Metric label="Tokens poupados" value={fmt(hygiene.economia_tokens_estimada)} />
                  </div>
                  <div className="space-y-2">
                    {hygiene.motivos.slice(0, 6).map((m) => (
                      <div key={`${m.reason}-${m.action}`} className="flex items-center justify-between text-sm border-b border-brand-700 pb-2">
                        <span className="text-slate-300">{m.reason}</span>
                        <span className="text-slate-500">{m.total}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {hygiene.samples.map((s) => (
                      <div key={s.id} className="bg-brand-700/50 border border-brand-600 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-slate-300 line-clamp-2">{s.text_snapshot || "(sem texto)"}</p>
                          <button
                            onClick={() => operationsApi.revertHygiene(s.id).then(load)}
                            className="text-slate-500 hover:text-amber-300"
                            title="Reverter para pendente"
                          >
                            <RotateCcw size={14} />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">{s.reason} · {s.plataforma || "sem plataforma"}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-violet-300" />
                <h2 className="text-xl font-bold text-white">Auditoria da IA</h2>
              </div>
              {audit && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Metric label="Processadas" value={fmt(audit.llm_processadas)} />
                    <Metric label="Pendentes" value={fmt(audit.llm_pendentes)} />
                    <Metric label="Correção manual" value={`${audit.taxa_correcao_manual}%`} />
                  </div>
                  <button
                    onClick={reprocess}
                    className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white border border-brand-600 hover:bg-brand-700 px-3 py-2 rounded-lg"
                  >
                    <RefreshCw size={14} />
                    Reprocessar 100 pendentes
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {audit.divergencias.slice(0, 8).map((d) => (
                      <span key={`${d.from}-${d.to}`} className="text-xs text-slate-300 bg-brand-700 border border-brand-600 px-2 py-1 rounded">
                        {d.from || "SEM"} → {d.to}: {d.total}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="space-y-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-red-400" />
                <h2 className="text-xl font-bold text-white">Fila de Crise</h2>
              </div>
              <div className="flex gap-2">
                <input
                  value={newCrisis}
                  onChange={(e) => setNewCrisis(e.target.value)}
                  placeholder="Nova crise"
                  className="flex-1 bg-brand-700 border border-brand-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"
                />
                <button onClick={createCrisis} className="p-2 rounded-lg bg-brand-400 hover:bg-brand-300 text-white">
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-2">
                {crises.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhuma crise operacional aberta.</p>
                ) : crises.map((c) => (
                  <div key={c.id} className="bg-brand-700/50 border border-brand-600 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-200">{c.title}</p>
                      <span className={`text-xs px-2 py-1 rounded-lg border ${badgeClass(c.priority)}`}>{c.priority}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`text-xs px-2 py-1 rounded-lg border ${badgeClass(c.status)}`}>{c.status}</span>
                      {c.owner && <span className="text-xs text-slate-500">{c.owner}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center gap-2">
                <Tags size={18} className="text-blue-300" />
                <h2 className="text-xl font-bold text-white">Entidades e Atores</h2>
              </div>
              <div className="flex gap-2">
                <input
                  value={newEntity}
                  onChange={(e) => setNewEntity(e.target.value)}
                  placeholder="Nova entidade ou ator"
                  className="flex-1 bg-brand-700 border border-brand-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"
                />
                <button onClick={createEntity} className="p-2 rounded-lg bg-brand-400 hover:bg-brand-300 text-white">
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {entities.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhuma entidade cadastrada.</p>
                ) : entities.map((e) => (
                  <div key={e.id} className="bg-brand-700/50 border border-brand-600 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-200">{e.name}</p>
                      <span className={`text-xs px-2 py-1 rounded-lg border ${badgeClass(e.stance)}`}>{e.stance}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{e.kind} · {e.aliases.join(", ") || "sem aliases"}</p>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <Card className="border-brand-500/30 bg-brand-500/5">
            <p className="text-sm text-slate-300 flex items-start gap-2 leading-6">
              <ClipboardList className="text-brand-300 mt-0.5" size={16} />
              A próxima evolução natural é ligar crises abertas às evidências da tela Inteligência e permitir aprovação formal de respostas.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
