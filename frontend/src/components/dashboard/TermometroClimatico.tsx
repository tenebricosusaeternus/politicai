import { useState } from "react"
import ReactECharts from "echarts-for-react"
import type { ResumoSentimentos } from "../../api/dashboard"
import { Modal } from "../ui/Modal"

interface Props {
  resumo: ResumoSentimentos | null
  loading?: boolean
}

const ZONAS = [
  {
    label: "Crise",
    max: 20,
    color: "#dc2626",
    bg: "rgba(220,38,38,0.12)",
    border: "rgba(220,38,38,0.4)",
    desc: "Clima muito negativo. Ação imediata recomendada.",
    icon: "🚨",
  },
  {
    label: "Alerta",
    max: 40,
    color: "#ea580c",
    bg: "rgba(234,88,12,0.12)",
    border: "rgba(234,88,12,0.4)",
    desc: "Pressão crescente. Monitorar de perto.",
    icon: "⚠️",
  },
  {
    label: "Moderado",
    max: 60,
    color: "#ca8a04",
    bg: "rgba(202,138,4,0.12)",
    border: "rgba(202,138,4,0.4)",
    desc: "Clima neutro. Manter atenção.",
    icon: "〰️",
  },
  {
    label: "Favorável",
    max: 80,
    color: "#16a34a",
    bg: "rgba(22,163,74,0.12)",
    border: "rgba(22,163,74,0.4)",
    desc: "Boa percepção pública.",
    icon: "✅",
  },
  {
    label: "Ótimo",
    max: 101,
    color: "#15803d",
    bg: "rgba(21,128,61,0.15)",
    border: "rgba(21,128,61,0.5)",
    desc: "Excelente clima político.",
    icon: "🌟",
  },
] as const

function getZona(v: number) {
  return ZONAS.find((z) => v < z.max) ?? ZONAS[ZONAS.length - 1]
}

/**
 * Converte o score de sentimento em valor de 0–100 para o gauge.
 * score = (pos - neg) / total * 100  →  range teórico [-100, +100]
 * gauge = clamp(50 + score, 0, 100)
 *   score = -50 → gauge =  0  (crise total)
 *   score =   0 → gauge = 50  (neutro)
 *   score = +50 → gauge = 100 (ótimo total)
 */
function toGaugeValue(positivas: number, negativas: number, total: number): number {
  if (total === 0) return 50
  const score = ((positivas - negativas) / total) * 100
  return Math.max(0, Math.min(100, 50 + score))
}

export function TermometroClimatico({ resumo, loading }: Props) {
  const [modalAberto, setModalAberto] = useState(false)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[240px] gap-3">
        <div className="w-7 h-7 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-600">Calculando clima...</p>
      </div>
    )
  }

  if (!resumo || resumo.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[240px]">
        <p className="text-slate-600 text-sm">Sem dados suficientes</p>
      </div>
    )
  }

  const gaugeValue = toGaugeValue(resumo.positivas, resumo.negativas, resumo.total)
  const zona = getZona(gaugeValue)
  const scoreNum = Math.round(((resumo.positivas - resumo.negativas) / resumo.total) * 100)

  const option = {
    backgroundColor: "transparent",
    series: [
      {
        type: "gauge",
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        center: ["50%", "62%"],
        radius: "88%",
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 22,
            color: [
              [0.2, "#dc2626"],
              [0.4, "#ea580c"],
              [0.6, "#ca8a04"],
              [0.8, "#16a34a"],
              [1.0, "#15803d"],
            ],
          },
        },
        // Separadores de zona — linhas escuras sobre o arco
        splitLine: {
          show: true,
          length: 22,
          distance: -22,
          splitNumber: 5,
          lineStyle: { color: "#0a1628", width: 4 },
        },
        axisTick: { show: false },
        axisLabel: { show: false },
        pointer: {
          length: "62%",
          width: 7,
          itemStyle: { color: "#f1f5f9", shadowBlur: 8, shadowColor: "rgba(0,0,0,0.6)" },
        },
        anchor: {
          show: true,
          size: 14,
          showAbove: true,
          itemStyle: { color: "#f1f5f9", borderWidth: 2, borderColor: "#1e3a5f" },
        },
        title: { show: false },
        detail: { show: false },
        data: [{ value: gaugeValue }],
        animationDuration: 1800,
        animationEasingUpdate: "quinticInOut",
      },
    ],
  }

  return (
    <>
    {modalAberto && (
      <Modal titulo="Como é calculado o Clima Político?" onClose={() => setModalAberto(false)}>
        <div className="space-y-4 text-sm text-slate-300">
          <p>
            O termômetro usa o <span className="text-white font-semibold">score de sentimento</span> —
            uma fórmula simples que mede o equilíbrio entre menções positivas e negativas no período selecionado.
          </p>

          {/* Fórmula */}
          <div className="bg-brand-800 border border-brand-600 rounded-xl px-4 py-3 font-mono text-center text-base">
            <span className="text-brand-200">score</span>
            {" = "}
            <span className="text-green-400">(positivas − negativas)</span>
            {" ÷ "}
            <span className="text-slate-300">total</span>
            {" × 100"}
          </div>

          <p className="text-slate-400 text-xs">
            Exemplo: 300 positivas, 80 negativas e 1.000 menções totais →{" "}
            <span className="text-white font-semibold">score = +22%</span> → zona <span className="text-green-400 font-semibold">Favorável</span>.
          </p>

          {/* Zonas */}
          <div className="space-y-2 pt-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Zonas do termômetro</p>
            {ZONAS.map((z) => (
              <div key={z.label} className="flex items-start gap-3">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap mt-0.5"
                  style={{ color: z.color, backgroundColor: z.bg, border: `1px solid ${z.border}` }}
                >
                  {z.icon} {z.label}
                </span>
                <div className="text-xs text-slate-400">
                  <span className="text-slate-300">{getIntervalo(z.label)}</span>
                  {" — "}
                  {z.desc}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 border-t border-brand-700 pt-3">
            Os sentimentos são classificados automaticamente pelo V-Tracker. Correções manuais feitas
            na página <span className="text-slate-300">Menções</span> são aplicadas antes do cálculo.
          </p>
        </div>
      </Modal>
    )}

    <div className="flex flex-col items-center select-none">
      {/* Gauge */}
      <div className="w-full" style={{ height: 190 }}>
        <ReactECharts option={option} style={{ height: 190 }} />
      </div>

      {/* Status badge */}
      <div
        className="flex items-center gap-2 px-5 py-1.5 rounded-full text-base font-bold -mt-4"
        style={{
          color: zona.color,
          backgroundColor: zona.bg,
          border: `1px solid ${zona.border}`,
        }}
      >
        <span>{zona.icon}</span>
        {zona.label}
      </div>

      {/* Description */}
      <p className="text-xs text-slate-500 mt-2 text-center px-2">{zona.desc}</p>

      {/* Score numérico */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <div className="text-center">
          <p className="text-green-400 font-bold text-lg font-mono leading-none">{resumo.positivas.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-slate-600 mt-0.5">positivas</p>
        </div>
        <div className="text-center">
          <p
            className="font-black text-2xl font-mono leading-none"
            style={{ color: zona.color }}
          >
            {scoreNum > 0 ? "+" : ""}{scoreNum}%
          </p>
          <p className="text-xs text-slate-600 mt-0.5">score</p>
        </div>
        <div className="text-center">
          <p className="text-red-400 font-bold text-lg font-mono leading-none">{resumo.negativas.toLocaleString("pt-BR")}</p>
          <p className="text-xs text-slate-600 mt-0.5">negativas</p>
        </div>
      </div>

      {/* Legenda das zonas + botão ? */}
      <div className="flex items-center justify-center gap-1.5 mt-4 flex-wrap">
        {ZONAS.map((z) => {
          const ativa = z.label === zona.label
          return (
            <span
              key={z.label}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-all"
              style={
                ativa
                  ? { color: z.color, backgroundColor: z.bg, border: `1px solid ${z.border}`, fontWeight: 600 }
                  : { color: "#475569" }
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ backgroundColor: ativa ? z.color : "#334155" }}
              />
              {z.label}
            </span>
          )
        })}
        <button
          onClick={() => setModalAberto(true)}
          className="w-5 h-5 rounded-full bg-brand-700 border border-brand-500 text-slate-400 hover:text-white hover:bg-brand-600 hover:border-brand-400 transition-all text-xs font-bold flex items-center justify-center ml-1"
          title="Como é calculado?"
        >
          ?
        </button>
      </div>
    </div>
    </>
  )
}

function getIntervalo(label: string): string {
  switch (label) {
    case "Crise":     return "score abaixo de −30%"
    case "Alerta":    return "score de −30% a −10%"
    case "Moderado":  return "score de −10% a +10%"
    case "Favorável": return "score de +10% a +30%"
    case "Ótimo":     return "score acima de +30%"
    default: return ""
  }
}
