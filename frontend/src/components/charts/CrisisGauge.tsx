import ReactECharts from "echarts-for-react"

interface Props { score: number }

function crisisColor(score: number) {
  if (score <= 3) return "#22c55e"
  if (score <= 5) return "#f59e0b"
  if (score <= 7.5) return "#f97316"
  return "#ef4444"
}

function crisisLabel(score: number) {
  if (score <= 3) return "Estável"
  if (score <= 5) return "Atenção"
  if (score <= 7.5) return "Elevado"
  return "CRÍTICO"
}

export function CrisisGauge({ score }: Props) {
  const color = crisisColor(score)

  const option = {
    backgroundColor: "transparent",
    series: [
      {
        type: "gauge",
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 10,
        radius: "85%",
        pointer: {
          length: "55%",
          width: 4,
          itemStyle: { color },
        },
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [0.3, "#22c55e"],
              [0.5, "#f59e0b"],
              [0.75, "#f97316"],
              [1, "#ef4444"],
            ],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          formatter: () => `${score.toFixed(1)}\n${crisisLabel(score)}`,
          color,
          fontSize: 22,
          fontWeight: "bold",
          lineHeight: 32,
          offsetCenter: [0, "30%"],
        },
        data: [{ value: score }],
      },
    ],
  }

  return <ReactECharts option={option} style={{ height: 220 }} />
}
