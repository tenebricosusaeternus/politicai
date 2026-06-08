import { useEffect, useState } from "react"
import { format, subDays } from "date-fns"
import { listEvents } from "../api/events"
import type { PoliticalEvent } from "../api/events"
import { Card } from "../components/ui/Card"
import { CrisisBadge } from "../components/ui/CrisisBadge"
import { Calendar, ExternalLink, MapPin, Tag, Users } from "lucide-react"

const sourceLabel: Record<string, string> = {
  vtracker: "V-Tracker",
  scraping: "Portal",
  social_media: "Redes Sociais",
  manual: "Manual",
}

export function Events() {
  const [events, setEvents] = useState<PoliticalEvent[]>([])
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"))
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"))
  const [severity, setSeverity] = useState("")
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<PoliticalEvent | null>(null)

  const load = () => {
    setLoading(true)
    listEvents({ date_from: dateFrom, date_to: dateTo, severity: severity || undefined }).then((data) => {
      setEvents(data)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-white">Eventos Políticos</h1>

        <div className="flex items-center gap-2 flex-wrap">
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
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="bg-brand-800 border border-brand-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"
          >
            <option value="">Todas as severidades</option>
            <option value="critical">Crítico</option>
            <option value="high">Alto</option>
            <option value="medium">Moderado</option>
            <option value="low">Baixo</option>
          </select>
          <button
            onClick={load}
            className="bg-brand-400 hover:bg-brand-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Filtrar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-2 space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider px-1">
            {events.length} evento{events.length !== 1 ? "s" : ""}
          </p>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <p className="text-slate-500 text-sm px-1">Sem eventos no período.</p>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              {events.map((ev) => (
                <button
                  key={ev.id}
                  onClick={() => setSelected(ev)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selected?.id === ev.id
                      ? "bg-brand-600 border-brand-400"
                      : "bg-brand-800 border-brand-600 hover:bg-brand-700"
                  }`}
                >
                  <p className="text-sm text-slate-200 line-clamp-2 leading-snug">{ev.title}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <CrisisBadge level={ev.severity} />
                    <span className="text-xs text-slate-500">{ev.event_date}</span>
                    {ev.location && (
                      <span className="text-xs text-slate-500 flex items-center gap-0.5">
                        <MapPin size={10} />{ev.location}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="col-span-3">
          {selected ? (
            <Card>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-bold text-white leading-snug">{selected.title}</h2>
                  <CrisisBadge level={selected.severity} />
                </div>

                <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
                  <span>{selected.event_date}</span>
                  <span className="bg-brand-700 px-2 py-0.5 rounded">{sourceLabel[selected.source] ?? selected.source}</span>
                  {selected.location && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} />{selected.location}
                    </span>
                  )}
                  {selected.sentiment_score !== null && selected.sentiment_score !== undefined && (
                    <span className={selected.sentiment_score > 0 ? "text-green-400" : selected.sentiment_score < 0 ? "text-red-400" : ""}>
                      Sentimento: {selected.sentiment_score > 0 ? "+" : ""}{selected.sentiment_score.toFixed(2)}
                    </span>
                  )}
                </div>

                {selected.description && (
                  <p className="text-sm text-slate-300 leading-relaxed">{selected.description}</p>
                )}

                {selected.actors && selected.actors.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                      <Users size={11} /> Atores envolvidos
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selected.actors.map((a) => (
                        <span key={a} className="bg-brand-700 text-slate-300 text-xs px-2 py-1 rounded-full">{a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.tags && selected.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                      <Tag size={11} /> Tags
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selected.tags.map((t) => (
                        <span key={t} className="bg-brand-600/50 text-brand-300 text-xs px-2 py-1 rounded-full">#{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.source_url && (
                  <a
                    href={selected.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-300/80 transition-colors"
                  >
                    <ExternalLink size={12} /> Ver fonte original
                  </a>
                )}
              </div>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
              Selecione um evento para ver os detalhes
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
