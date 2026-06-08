import ReactECharts from "echarts-for-react"
import type { PoliticalEvent } from "../../api/events"

interface Props { events: PoliticalEvent[] }

export function SeverityBar({ events }: Props) {
  const counts = { low: 0, medium: 0, high: 0, critical: 0 }
  events.forEach((e) => { counts[e.severity]++ })

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#0d1526",
      borderColor: "#1a2a45",
      textStyle: { color: "#e2e8f0", fontSize: 12 },
    },
    grid: { top: 5, right: 10, bottom: 20, left: 10, containLabel: true },
    xAxis: {
      type: "category",
      data: ["Baixo", "Moderado", "Alto", "Crítico"],
      axisLabel: { color: "#64748b", fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#111d33", type: "dashed" } },
      axisLabel: { color: "#64748b", fontSize: 10 },
    },
    series: [
      {
        type: "bar",
        data: [
          { value: counts.low, itemStyle: { color: "#22c55e", borderRadius: [4, 4, 0, 0] } },
          { value: counts.medium, itemStyle: { color: "#f59e0b", borderRadius: [4, 4, 0, 0] } },
          { value: counts.high, itemStyle: { color: "#f97316", borderRadius: [4, 4, 0, 0] } },
          { value: counts.critical, itemStyle: { color: "#ef4444", borderRadius: [4, 4, 0, 0] } },
        ],
        barWidth: "50%",
      },
    ],
  }

  return <ReactECharts option={option} style={{ height: 160 }} />
}
