import ReactECharts from "echarts-for-react"
import type { ResumoPlataformas } from "../../api/dashboard"

interface Props {
  data: ResumoPlataformas | null
  loading: boolean
}

const CORES_PLATAFORMA: Record<string, string> = {
  Twitter: "#1d9bf0",
  X: "#1d9bf0",
  Facebook: "#1877f2",
  Instagram: "#e1306c",
  YouTube: "#ff0000",
  TikTok: "#69c9d0",
  LinkedIn: "#0a66c2",
  "Google News": "#4285f4",
  News: "#f59e0b",
  Outros: "#64748b",
}

function corPlataforma(nome: string): string {
  for (const [key, cor] of Object.entries(CORES_PLATAFORMA)) {
    if (nome.toLowerCase().includes(key.toLowerCase())) return cor
  }
  return "#64748b"
}

export function GraficoBolhasPlataformas({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!data || !data.plataformas.length) {
    return <p className="text-slate-500 text-sm">Sem dados de plataformas</p>
  }

  const plats = data.plataformas
  const maxTotal = Math.max(...plats.map((p) => p.total), 1)

  const option = {
    backgroundColor: "transparent",
    tooltip: {
      formatter: (params: { data: { name: string; value: number[]; total: number; score: number; engajamento: number } }) => {
        const d = params.data
        return [
          `<b>${d.name}</b>`,
          `Menções: <b>${d.total.toLocaleString("pt-BR")}</b>`,
          `Score sentimento: <b>${d.score > 0 ? "+" : ""}${d.score}%</b>`,
          `Engajamento: <b>${d.engajamento.toLocaleString("pt-BR")}</b>`,
        ].join("<br/>")
      },
    },
    grid: { top: 20, bottom: 40, left: 50, right: 20, containLabel: false },
    xAxis: {
      name: "Volume de menções",
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: { color: "#64748b", fontSize: 11 },
      type: "value",
      min: 0,
      axisLabel: { color: "#64748b", fontSize: 11 },
      splitLine: { lineStyle: { color: "#1e3a5f40" } },
    },
    yAxis: {
      name: "Score sentimento",
      nameLocation: "middle",
      nameGap: 40,
      nameTextStyle: { color: "#64748b", fontSize: 11 },
      type: "value",
      min: -100,
      max: 100,
      axisLabel: {
        color: "#64748b",
        fontSize: 11,
        formatter: (v: number) => `${v > 0 ? "+" : ""}${v}%`,
      },
      splitLine: { lineStyle: { color: "#1e3a5f40" } },
      // Linha zero destacada
      markLine: {
        silent: true,
        data: [{ yAxis: 0 }],
        lineStyle: { color: "#334155", type: "dashed" },
        label: { show: false },
      },
    },
    series: [
      {
        type: "scatter",
        data: plats.map((p) => ({
          name: p.nome,
          value: [p.total, p.score_sentimento],
          total: p.total,
          score: p.score_sentimento,
          engajamento: p.engajamento_total,
          symbolSize: Math.max(18, Math.sqrt(p.total / maxTotal) * 80),
          itemStyle: {
            color: corPlataforma(p.nome),
            opacity: 0.85,
            borderColor: corPlataforma(p.nome),
            borderWidth: 1,
          },
          label: {
            show: true,
            formatter: "{b}",
            position: "top",
            color: "#94a3b8",
            fontSize: 10,
          },
        })),
        emphasis: {
          scale: true,
          itemStyle: { opacity: 1 },
        },
      },
    ],
  }

  return (
    <div className="space-y-2">
      <ReactECharts option={option} style={{ height: 300 }} />
      <p className="text-xs text-slate-600 text-center">
        Tamanho da bolha = volume relativo de menções
      </p>
    </div>
  )
}
