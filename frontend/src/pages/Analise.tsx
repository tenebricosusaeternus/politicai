import { useEffect, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { dashboardApi } from "../api/dashboard"
import type {
  Monitoramento,
  ResumoVelocidade,
  ResumoPublicadores,
  ResumoPlataformas,
  ResumoHeatmap,
  HeatmapModo,
} from "../api/dashboard"
import { Card } from "../components/ui/Card"
import { VelocidadeMencoes } from "../components/analise/VelocidadeMencoes"
import { TopPublicadores } from "../components/analise/TopPublicadores"
import { GraficoBolhasPlataformas } from "../components/analise/GraficoBolhasPlataformas"
import { HeatmapAtividade } from "../components/analise/HeatmapAtividade"
import { Calendar, TrendingUp, Users, BarChart2, Activity, AlertTriangle } from "lucide-react"

const MONITOR_OPTIONS: { value: Monitoramento; label: string }[] = [
  { value: "todos", label: "Igor Normando" },
  { value: "radar_belem", label: "Radar Belém" },
  { value: "boletim_belem", label: "Boletim Belém" },
]

export function Analise() {
  const [monitoramento, setMonitoramento] = useState<Monitoramento>("todos")
  const [dataInicio, setDataInicio] = useState(format(new Date(), "yyyy-MM-dd"))
  const [dataFim, setDataFim] = useState(format(new Date(), "yyyy-MM-dd"))
  const [heatmapModo, setHeatmapModo] = useState<HeatmapModo>("volume")

  const [velocidade, setVelocidade] = useState<ResumoVelocidade | null>(null)
  const [publicadores, setPublicadores] = useState<ResumoPublicadores | null>(null)
  const [plataformas, setPlataformas] = useState<ResumoPlataformas | null>(null)
  const [heatmap, setHeatmap] = useState<ResumoHeatmap | null>(null)

  const [loadingVel, setLoadingVel] = useState(true)
  const [loadingPub, setLoadingPub] = useState(true)
  const [loadingPlat, setLoadingPlat] = useState(true)
  const [loadingHeat, setLoadingHeat] = useState(true)
  const [erro, setErro] = useState("")

  function load() {
    setErro("")
    const d1 = dataInicio
    const d2 = dataFim
    const m = monitoramento

    setLoadingVel(true)
    dashboardApi.velocidade(m, d1, d2)
      .then(setVelocidade)
      .catch((e) => setErro(e?.response?.data?.detail || e.message || "Erro"))
      .finally(() => setLoadingVel(false))

    setLoadingPub(true)
    dashboardApi.publicadores(m, d1, d2)
      .then(setPublicadores)
      .catch(() => null)
      .finally(() => setLoadingPub(false))

    setLoadingPlat(true)
    dashboardApi.plataformas(m, d1, d2)
      .then(setPlataformas)
      .catch(() => null)
      .finally(() => setLoadingPlat(false))

    setLoadingHeat(true)
    dashboardApi.heatmap(m, d1, d2, 5, heatmapModo)
      .then(setHeatmap)
      .catch(() => null)
      .finally(() => setLoadingHeat(false))
  }

  // Quando muda modo do heatmap, só recarrega esse gráfico
  function loadHeatmap(modo: HeatmapModo) {
    setHeatmapModo(modo)
    setLoadingHeat(true)
    dashboardApi.heatmap(monitoramento, dataInicio, dataFim, 5, modo)
      .then(setHeatmap)
      .catch(() => null)
      .finally(() => setLoadingHeat(false))
  }

  useEffect(() => { load() }, [])

  const today = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* ── Header + filtros ── */}
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold text-white">Análise Aprofundada</h1>
          <p className="text-slate-400 text-sm mt-0.5 capitalize">{today}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={monitoramento}
            onChange={(e) => setMonitoramento(e.target.value as Monitoramento)}
            className="bg-brand-800 border border-brand-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"
          >
            {MONITOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 bg-brand-800 border border-brand-600 rounded-lg px-3 py-2 flex-1 min-w-[130px]">
            <Calendar size={13} className="text-slate-400 flex-shrink-0" />
            <input
              type="date" value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-transparent text-sm text-slate-200 outline-none w-full"
            />
          </div>
          <span className="text-slate-500 text-sm">até</span>
          <div className="flex items-center gap-1.5 bg-brand-800 border border-brand-600 rounded-lg px-3 py-2 flex-1 min-w-[130px]">
            <Calendar size={13} className="text-slate-400 flex-shrink-0" />
            <input
              type="date" value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-transparent text-sm text-slate-200 outline-none w-full"
            />
          </div>
          <button
            onClick={load}
            className="bg-brand-400 hover:bg-brand-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            Atualizar
          </button>
        </div>
      </div>

      {erro && (
        <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertTriangle size={15} />{erro}
        </div>
      )}

      {/* ── Linha 1: Velocidade (largura total) ── */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} className="text-brand-300" />
          <p className="text-sm font-semibold text-white">Velocidade — período atual vs anterior</p>
        </div>
        <VelocidadeMencoes data={velocidade} loading={loadingVel} />
      </Card>

      {/* ── Linha 2: Plataformas + Top Publicadores (50/50) ── */}
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

      {/* ── Linha 3: Heatmap (largura total) ── */}
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

    </div>
  )
}
