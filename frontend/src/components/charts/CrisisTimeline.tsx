import ReactECharts from "echarts-for-react"
import type { CrisisPoint } from "../../api/reports"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

interface Props { data: CrisisPoint[] }

export function CrisisTimeline({ data }: Props) {
  const dates = data.map((d) => format(parseISO(d.date), "dd/MM", { locale: ptBR }))
  const crisis = data.map((d) => d.crisis_score ?? 0)
  const sentiment = data.map((d) =>
    d.sentiment_score !== null ? ((d.sentiment_score + 1) / 2) * 10 : null
  )

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#0d1526",
      borderColor: "#1a2a45",
      textStyle: { color: "#e2e8f0", fontSize: 12 },
      formatter: (params: { name: string; value: number; seriesName: string }[]) => {
        const lines = params.map(
          (p) => `<span style="color:${p.seriesName === "Índice de Crise" ? "#ef4444" : "#3b82f6"}">${p.seriesName}: <b>${p.value?.toFixed(1)}</b></span>`
        )
        return `<div>${params[0].name}<br>${lines.join("<br>")}</div>`
      },
    },
    legend: {
      data: ["Índice de Crise", "Sentimento Político"],
      textStyle: { color: "#94a3b8", fontSize: 11 },
      bottom: 0,
    },
    grid: { top: 10, right: 10, bottom: 40, left: 40 },
    xAxis: {
      type: "category",
      data: dates,
      axisLine: { lineStyle: { color: "#1a2a45" } },
      axisLabel: { color: "#64748b", fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 10,
      splitLine: { lineStyle: { color: "#111d33", type: "dashed" } },
      axisLabel: { color: "#64748b", fontSize: 10 },
    },
    series: [
      {
        name: "Índice de Crise",
        type: "line",
        data: crisis,
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#ef4444", width: 2.5 },
        areaStyle: {
          color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(239,68,68,0.3)" }, { offset: 1, color: "rgba(239,68,68,0)" }] },
        },
      },
      {
        name: "Sentimento Político",
        type: "line",
        data: sentiment,
        smooth: true,
        symbol: "none",
        lineStyle: { color: "#3b82f6", width: 2, type: "dashed" },
      },
    ],
  }

  return <ReactECharts option={option} style={{ height: 240 }} />
}
