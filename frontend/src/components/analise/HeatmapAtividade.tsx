import ReactECharts from "echarts-for-react"
import type { ResumoHeatmap, HeatmapModo } from "../../api/dashboard"

interface Props {
  data: ResumoHeatmap | null
  loading: boolean
  modo: HeatmapModo
  onModoChange: (m: HeatmapModo) => void
}

export function HeatmapAtividade({ data, loading, modo, onModoChange }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-52">
        <div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!data || data.mencoes_analisadas === 0) {
    return <p className="text-slate-500 text-sm">Sem dados para o período</p>
  }

  // Converte matriz 7×24 para array ECharts: [hora, dia, valor]
  const heatData: [number, number, number][] = []
  let maxVal = 0
  let minVal = 0

  data.matriz.forEach((linha, dia) => {
    linha.forEach((val, hora) => {
      if (val !== null && val !== undefined) {
        heatData.push([hora, dia, val])
        if (val > maxVal) maxVal = val
        if (val < minVal) minVal = val
      }
    })
  })

  const isVolume = modo === "volume"

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      formatter: (p: { data: [number, number, number] }) => {
        const [hora, dia, val] = p.data
        const diaLabel = data.dias_semana[dia] ?? dia
        const horaLabel = `${String(hora).padStart(2, "0")}h`
        if (isVolume) return `${diaLabel} ${horaLabel}<br/><b>${val} menções</b>`
        return `${diaLabel} ${horaLabel}<br/>Score: <b>${val > 0 ? "+" : ""}${val}%</b>`
      },
    },
    grid: { top: 10, bottom: 50, left: 40, right: 20 },
    xAxis: {
      type: "category",
      data: data.horas.map((h) => `${String(h).padStart(2, "0")}h`),
      axisLabel: {
        color: "#64748b",
        fontSize: 10,
        interval: 1,
        rotate: 0,
      },
      splitArea: { show: true, areaStyle: { color: ["transparent", "#0f1f3d20"] } },
    },
    yAxis: {
      type: "category",
      data: data.dias_semana,
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitArea: { show: true, areaStyle: { color: ["transparent", "#0f1f3d20"] } },
    },
    visualMap: isVolume
      ? {
          min: 0,
          max: maxVal || 1,
          calculable: false,
          show: false,
          inRange: {
            color: ["#0f1f3d", "#1e3a8a", "#2563eb", "#22c55e"],
          },
        }
      : {
          min: -100,
          max: 100,
          calculable: false,
          show: false,
          inRange: {
            color: ["#dc2626", "#1e3a5f", "#16a34a"],
          },
        },
    series: [
      {
        type: "heatmap",
        data: heatData,
        label: {
          show: maxVal <= 30,
          fontSize: 9,
          color: "#ffffff80",
          formatter: (p: { data: [number, number, number] }) =>
            p.data[2] > 0 ? String(p.data[2]) : "",
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.5)" } },
      },
    ],
  }

  return (
    <div className="space-y-3">
      {/* Toggle modo */}
      <div className="flex gap-1">
        {(["volume", "sentimento"] as HeatmapModo[]).map((m) => (
          <button
            key={m}
            onClick={() => onModoChange(m)}
            className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${
              modo === m
                ? "bg-brand-500 text-white font-medium"
                : "text-slate-400 hover:text-white hover:bg-brand-700"
            }`}
          >
            {m === "volume" ? "Volume" : "Sentimento"}
          </button>
        ))}
      </div>

      <ReactECharts option={option} style={{ height: 220 }} />

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
        {isVolume ? (
          <>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded inline-block" style={{ background: "#0f1f3d" }} />
              0 menções
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded inline-block" style={{ background: "#2563eb" }} />
              moderado
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded inline-block" style={{ background: "#22c55e" }} />
              pico de atividade
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded inline-block bg-red-600" />
              negativo
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded inline-block" style={{ background: "#1e3a5f" }} />
              neutro
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded inline-block bg-green-600" />
              positivo
            </span>
          </>
        )}
        <span className="ml-auto">{data.mencoes_analisadas.toLocaleString("pt-BR")} menções · hora local UTC</span>
      </div>
    </div>
  )
}
