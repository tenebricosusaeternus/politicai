import { useCallback, useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import {
  AlertTriangle, Calendar, Check, ExternalLink, Filter, Link as LinkIcon,
  Plus, RefreshCw, ShieldAlert, X,
} from "lucide-react"
import {
  approveCrisisCandidate,
  createEvent,
  listCrisisCandidates,
  listEvents,
  rejectCrisisCandidate,
  updateEvent,
} from "../api/events"
import type { CrisisCandidate, PoliticalEvent } from "../api/events"
import { Card } from "../components/ui/Card"
import { CrisisBadge } from "../components/ui/CrisisBadge"

const statusLabel: Record<string, string> = {
  approved: "Aprovada",
  rejected: "Rejeitada",
  monitoring: "Monitorando",
  resolved: "Resolvida",
}

const nivelLabel: Record<string, string> = {
  potencial: "Potencial",
  incubacao: "Em incubação",
  instalada: "Instalada",
}

function statusEvento(ev: PoliticalEvent): string {
  return ev.raw_data?.crisis_status || "approved"
}

function severidadePorNivel(nivel: CrisisCandidate["nivel"]): PoliticalEvent["severity"] {
  if (nivel === "instalada") return "critical"
  if (nivel === "incubacao") return "high"
  return "medium"
}

export function Events() {
  const [candidates, setCandidates] = useState<CrisisCandidate[]>([])
  const [events, setEvents] = useState<PoliticalEvent[]>([])
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"))
  const [status, setStatus] = useState("approved")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PoliticalEvent | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState({
    title: "",
    description: "",
    severity: "medium",
    location: "",
    source_url: "",
    event_date: format(new Date(), "yyyy-MM-dd"),
    tags: "",
    actors: "",
  })

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      listCrisisCandidates({ date_from: dateFrom, date_to: dateTo }),
      listEvents({ date_from: dateFrom, date_to: dateTo, status }),
    ])
      .then(([cand, evs]) => {
        setCandidates(cand)
        setEvents(evs)
        setSelected((atual) => atual ? evs.find((ev) => ev.id === atual.id) || null : evs[0] || null)
      })
      .finally(() => setLoading(false))
  }, [dateFrom, dateTo, status])

  useEffect(() => { load() }, [load])

  const pendingCandidates = useMemo(
    () => candidates.filter((c) => c.curation_status === "candidate"),
    [candidates],
  )

  async function aprovar(c: CrisisCandidate) {
    const ev = await approveCrisisCandidate(c)
    setSelected(ev)
    load()
  }

  async function rejeitar(c: CrisisCandidate) {
    const reason = prompt("Motivo da rejeição? Ex.: fora do escopo, pouco lastro, link ruim") || ""
    const ev = await rejectCrisisCandidate(c, reason)
    setSelected(ev)
    load()
  }

  async function mudarStatus(ev: PoliticalEvent, novoStatus: string) {
    const atualizado = await updateEvent(ev.id, { status: novoStatus })
    setSelected(atualizado)
    load()
  }

  async function salvarManual() {
    const ev = await createEvent({
      ...manual,
      tags: manual.tags.split(",").map((x) => x.trim()).filter(Boolean),
      actors: manual.actors.split(",").map((x) => x.trim()).filter(Boolean),
      status: "approved",
    })
    setManualOpen(false)
    setSelected(ev)
    setManual({
      title: "",
      description: "",
      severity: "medium",
      location: "",
      source_url: "",
      event_date: format(new Date(), "yyyy-MM-dd"),
      tags: "",
      actors: "",
    })
    load()
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1800px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Crises</h1>
          <p className="text-base text-slate-400 mt-1">
            Curadoria dos sinais que podem entrar na sala de inteligência: aprove, rejeite ou crie uma crise manualmente.
          </p>
        </div>

        <button
          onClick={() => setManualOpen((v) => !v)}
          className="inline-flex items-center gap-2 bg-brand-400 hover:bg-brand-300 text-white text-base font-semibold px-5 py-3 rounded-lg transition-colors"
        >
          <Plus size={16} /> Adicionar crise
        </button>
      </div>

      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-brand-900 border border-brand-600 rounded-lg px-4 py-3">
            <Calendar size={16} className="text-slate-400" />
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-36" />
          </div>
          <span className="text-slate-500 text-base">até</span>
          <div className="flex items-center gap-2 bg-brand-900 border border-brand-600 rounded-lg px-4 py-3">
            <Calendar size={16} className="text-slate-400" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-36" />
          </div>
          <div className="flex items-center gap-2 bg-brand-900 border border-brand-600 rounded-lg px-4 py-3">
            <Filter size={16} className="text-slate-400" />
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none">
              <option value="approved">Aprovadas</option>
              <option value="monitoring">Monitorando</option>
              <option value="resolved">Resolvidas</option>
              <option value="rejected">Rejeitadas</option>
              <option value="all">Todas</option>
            </select>
          </div>
          <button onClick={load}
            className="inline-flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-slate-200 text-base font-semibold px-5 py-3 rounded-lg transition-colors">
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
      </Card>

      {manualOpen && (
        <Card>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })}
              placeholder="Título da crise" className="md:col-span-2 bg-brand-900 border border-brand-600 rounded-lg px-4 py-3 text-slate-200 outline-none" />
            <textarea value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })}
              placeholder="Descrição, leitura política e contexto" rows={4}
              className="md:col-span-2 bg-brand-900 border border-brand-600 rounded-lg px-4 py-3 text-slate-200 outline-none resize-none" />
            <select value={manual.severity} onChange={(e) => setManual({ ...manual, severity: e.target.value })}
              className="bg-brand-900 border border-brand-600 rounded-lg px-4 py-3 text-slate-200 outline-none">
              <option value="medium">Potencial</option>
              <option value="high">Em incubação</option>
              <option value="critical">Instalada</option>
              <option value="low">Baixa prioridade</option>
            </select>
            <input value={manual.location} onChange={(e) => setManual({ ...manual, location: e.target.value })}
              placeholder="Bairro, órgão ou tema" className="bg-brand-900 border border-brand-600 rounded-lg px-4 py-3 text-slate-200 outline-none" />
            <input value={manual.source_url} onChange={(e) => setManual({ ...manual, source_url: e.target.value })}
              placeholder="Link principal" className="bg-brand-900 border border-brand-600 rounded-lg px-4 py-3 text-slate-200 outline-none" />
            <input type="date" value={manual.event_date} onChange={(e) => setManual({ ...manual, event_date: e.target.value })}
              className="bg-brand-900 border border-brand-600 rounded-lg px-4 py-3 text-slate-200 outline-none" />
            <input value={manual.tags} onChange={(e) => setManual({ ...manual, tags: e.target.value })}
              placeholder="Tags separadas por vírgula" className="bg-brand-900 border border-brand-600 rounded-lg px-4 py-3 text-slate-200 outline-none" />
            <input value={manual.actors} onChange={(e) => setManual({ ...manual, actors: e.target.value })}
              placeholder="Atores/publicadores separados por vírgula" className="bg-brand-900 border border-brand-600 rounded-lg px-4 py-3 text-slate-200 outline-none" />
            <div className="md:col-span-2 flex justify-end gap-2">
              <button onClick={() => setManualOpen(false)} className="px-4 py-2 rounded-lg text-slate-400 hover:text-white">Cancelar</button>
              <button onClick={salvarManual} className="px-5 py-2 rounded-lg bg-brand-400 text-white font-semibold">Salvar crise</button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm uppercase tracking-wider text-slate-500 font-semibold">Candidatas da base</p>
              <span className="text-xs text-brand-300">{pendingCandidates.length}</span>
            </div>
            {loading ? (
              <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" /></div>
            ) : pendingCandidates.length === 0 ? (
              <p className="text-sm text-slate-500">Sem novas candidatas no período.</p>
            ) : (
              <div className="space-y-2 max-h-[36rem] overflow-y-auto pr-1">
                {pendingCandidates.map((c) => (
                  <div key={c.candidate_key} className="rounded-lg border border-brand-600 bg-brand-900/50 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white leading-5">{c.tema}</p>
                      <CrisisBadge level={severidadePorNivel(c.nivel)} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {nivelLabel[c.nivel]} • {c.mencoes} menções • {c.engajamento} interações
                    </p>
                    <p className="text-sm text-slate-400 line-clamp-2">{c.resposta_sugerida}</p>
                    {c.evidencias?.[0]?.link && (
                      <a href={c.evidencias[0].link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand-300 hover:text-brand-200">
                        <LinkIcon size={12} /> Link principal
                      </a>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => aprovar(c)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25">
                        <Check size={13} /> Aprovar
                      </button>
                      <button onClick={() => rejeitar(c)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/20">
                        <X size={13} /> Rejeitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="xl:col-span-4 space-y-2">
          <p className="text-sm text-slate-500 uppercase tracking-wider px-1">
            {events.length} crise{events.length !== 1 ? "s" : ""} {status !== "all" ? statusLabel[status]?.toLowerCase() : ""}
          </p>
          <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
            {events.map((ev) => (
              <button key={ev.id} onClick={() => setSelected(ev)}
                className={`w-full text-left p-4 rounded-lg border transition-colors shadow-[var(--shadow-card)] ${
                  selected?.id === ev.id ? "bg-brand-600 border-brand-400" : "bg-brand-800 border-brand-600 hover:bg-brand-700"
                }`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base text-slate-200 line-clamp-2 leading-6">{ev.title}</p>
                  <CrisisBadge level={ev.severity} />
                </div>
                <p className="text-sm text-slate-500 mt-1">
                  {ev.event_date} • {statusLabel[statusEvento(ev)] || statusEvento(ev)}
                </p>
              </button>
            ))}
            {!loading && events.length === 0 && <p className="text-sm text-slate-500 px-1">Nenhuma crise nessa visão.</p>}
          </div>
        </div>

        <div className="xl:col-span-4">
          {selected ? (
            <Card>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Crise curada</p>
                    <h2 className="text-xl font-bold text-white leading-snug mt-1">{selected.title}</h2>
                  </div>
                  <CrisisBadge level={selected.severity} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <select value={statusEvento(selected)} onChange={(e) => mudarStatus(selected, e.target.value)}
                    className="bg-brand-900 border border-brand-600 rounded-lg px-3 py-2 text-slate-200 outline-none">
                    <option value="approved">Aprovada</option>
                    <option value="monitoring">Monitorando</option>
                    <option value="resolved">Resolvida</option>
                    <option value="rejected">Rejeitada</option>
                  </select>
                  <select value={selected.severity} onChange={(e) => updateEvent(selected.id, { severity: e.target.value }).then(setSelected).then(load)}
                    className="bg-brand-900 border border-brand-600 rounded-lg px-3 py-2 text-slate-200 outline-none">
                    <option value="low">Baixa</option>
                    <option value="medium">Potencial</option>
                    <option value="high">Em incubação</option>
                    <option value="critical">Instalada</option>
                  </select>
                </div>

                {selected.description && <p className="text-base text-slate-300 leading-7">{selected.description}</p>}

                <div className="space-y-2 text-sm text-slate-500">
                  <p><ShieldAlert size={13} className="inline mr-1 text-brand-300" /> {selected.location || "Sem local/órgão definido"}</p>
                  <p><Calendar size={13} className="inline mr-1 text-brand-300" /> {selected.event_date}</p>
                </div>

                {selected.tags && selected.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selected.tags.map((t) => <span key={t} className="bg-brand-700 text-brand-300 text-xs px-2 py-1 rounded-full">#{t}</span>)}
                  </div>
                )}

                {selected.raw_data?.crisis_payload?.evidencias?.length ? (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Evidências</p>
                    {selected.raw_data.crisis_payload.evidencias.map((ev) => (
                      <a key={`${ev.id}-${ev.link}`} href={ev.link || "#"} target="_blank" rel="noopener noreferrer"
                        className="block rounded-lg border border-brand-600 bg-brand-900/60 p-3 hover:border-brand-400">
                        <p className="text-sm text-slate-300 line-clamp-3">{ev.texto}</p>
                        <p className="text-xs text-slate-500 mt-1">{ev.publicador || ev.plataforma} • {ev.engajamento} interações</p>
                      </a>
                    ))}
                  </div>
                ) : null}

                {selected.source_url && (
                  <a href={selected.source_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-brand-300 hover:text-brand-200">
                    <ExternalLink size={14} /> Abrir link principal
                  </a>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center gap-3 text-slate-500">
                <AlertTriangle size={18} />
                <p className="text-sm">Selecione uma crise aprovada ou aprove uma candidata da base.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
