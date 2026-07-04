import { useCallback, useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Calendar, RefreshCw } from "lucide-react"
import { intelligenceApi } from "../api/intelligence"
import type { IntelligenceOverview } from "../api/intelligence"
import { Card } from "../components/ui/Card"

function periodoLabel(data: IntelligenceOverview | null): string {
  if (!data) return ""
  const inicio = new Date(`${data.periodo.inicio}T00:00:00`)
  const fim = new Date(`${data.periodo.fim}T00:00:00`)
  return `${format(inicio, "dd 'de' MMMM", { locale: ptBR })} a ${format(fim, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} milhão`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} mil`
  return String(n)
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm
}

function quantidade(n: number, singular: string, pluralForm: string): string {
  return `${n} ${plural(n, singular, pluralForm)}`
}

function quantidadeFmt(n: number, singular: string, pluralForm: string): string {
  return `${fmt(n)} ${plural(n, singular, pluralForm)}`
}

function nomeLimpo(valor: string): string {
  const texto = valor || ""
  if (!texto.includes("\\u")) return texto
  try {
    return JSON.parse(`"${texto.replace(/"/g, '\\"')}"`)
  } catch {
    return texto
  }
}

function maturidadeCrises(data: IntelligenceOverview): string {
  const instaladas = data.crises.filter((c) => c.nivel === "instalada")
  const incubacao = data.crises.filter((c) => c.nivel === "incubacao")
  const potenciais = data.crises.filter((c) => c.nivel === "potencial")

  if (instaladas.length) {
    return `Há ${quantidade(instaladas.length, "crise instalada", "crises instaladas")}, o que muda a natureza do monitoramento: deixa de ser observação e passa a exigir coordenação de resposta. O caso mais sensível é ${instaladas[0].tema}, sustentado por ${quantidade(instaladas[0].mencoes, "menção", "menções")} e ${quantidadeFmt(instaladas[0].engajamento, "interação", "interações")}.`
  }

  if (incubacao.length) {
    return `Não há crise instalada, mas há ${quantidade(incubacao.length, "episódio em incubação", "episódios em incubação")}. Isso significa que o problema ainda não domina a conversa, mas já tem repetição ou tração suficiente para merecer acompanhamento diário. O primeiro ponto de atenção é ${incubacao[0].tema}.`
  }

  if (potenciais.length) {
    const leitura = potenciais.length === 1
      ? "Ele ainda é pequeno, mas tem valor político porque aponta onde uma reclamação local pode crescer se encontrar eco em bairro, imprensa, vereador ou perfil de alta circulação."
      : "Eles ainda são pequenos, mas têm valor político porque apontam onde reclamações locais podem crescer se encontrarem eco em bairro, imprensa, vereador ou perfil de alta circulação."
    return `O painel mostra ${quantidade(potenciais.length, "sinal de crise potencial", "sinais de crise potencial")}. ${leitura} O mais relevante agora é ${potenciais[0].tema}.`
  }

  return "Não há episódio de crise municipal suficientemente sustentado no período. Isso não significa ausência de problemas na cidade; significa que, nos dados curados, nenhum assunto reuniu evidência pública bastante para ser tratado como crise."
}

function leituraAmbiente(data: IntelligenceOverview): string {
  const score = data.briefing.kpis.score_sentimento
  const audit = data.auditoria_ia
  const curadas = audit.mencoes_curadas_politicas ?? data.briefing.kpis.total
  const uteis = audit.mencoes_uteis ?? data.briefing.kpis.total

  if (curadas < 20) {
    return `A janela analisada tem baixo volume político curado: ${curadas} menções com relação municipal clara dentro de ${uteis} menções úteis. Nessa condição, a leitura mais honesta é de baixa temperatura pública. Há sinais, mas ainda não há massa crítica para cravar tendência. O trabalho correto aqui é vigilância: observar se os sinais se repetem, se ganham porta-vozes e se saem do caso isolado para uma narrativa reconhecível.`
  }

  if (score <= -20) {
    return `O ambiente político digital está desfavorável. As menções negativas superam as positivas em intensidade suficiente para indicar desgaste de percepção, não apenas ruído pontual. Quando isso acontece, a gestão precisa evitar comunicação celebratória deslocada e priorizar prestação de contas: explicar providências, mostrar responsáveis e reduzir a distância entre anúncio e entrega percebida.`
  }

  if (score >= 20) {
    return `O ambiente está favorável, mas não deve ser lido como cheque em branco. A vantagem positiva costuma se sustentar quando a comunicação conecta entrega, território e benefício concreto. O risco, nesse cenário, é desperdiçar capital político com publicações genéricas, enquanto os problemas locais seguem formando pequenos focos de cobrança.`
  }

  return `O ambiente está competitivo e sem dominância clara. Há menções positivas e negativas convivendo sem que uma narrativa tenha tomado o centro da agenda. Para uma gestão municipal, esse é um terreno de disputa: pequenos problemas locais podem crescer rápido, mas entregas bem documentadas também têm espaço para organizar a percepção pública.`
}

function leituraNarrativas(data: IntelligenceOverview): string {
  if (!data.narrativas.length) {
    return "Ainda não há narrativa estratégica suficientemente consolidada. Isso favorece uma comunicação mais preventiva: organizar provas de entrega, responder sinais locais e evitar transformar assuntos pequenos em polêmica maior."
  }

  const lider = data.narrativas[0]
  const negativas = data.narrativas.filter((n) => n.score_sentimento < 0)
  const positivas = data.narrativas.filter((n) => n.score_sentimento > 0)
  const termos = lider.termos.slice(0, 4).join(", ")

  let texto = `A narrativa mais visível é ${lider.nome}. Ela reúne ${quantidade(lider.total, "menção", "menções")}, saldo de sentimento ${lider.score_sentimento} e termos associados como ${termos || "sem termos dominantes"}. `

  if (negativas.length) {
    texto += `O campo de maior pressão negativa aparece em ${negativas.slice(0, 3).map((n) => `${n.nome} (${n.score_sentimento})`).join(", ")}. Esses temas merecem leitura operacional: não basta responder no discurso, é preciso verificar se há serviço, bairro ou órgão específico por trás da cobrança. `
  }

  if (positivas.length) {
    texto += `Há sustentação favorável em ${positivas.slice(0, 2).map((n) => `${n.nome} (+${n.score_sentimento})`).join(", ")}. Esses assuntos podem ser usados para equilibrar a agenda, desde que venham acompanhados de evidência concreta e não apenas propaganda.`
  }

  return texto
}

function leituraAtores(data: IntelligenceOverview): string {
  if (!data.atores.length) {
    return "Não há atores recorrentes suficientes para configurar campo político organizado. A ausência de porta-vozes fortes reduz risco de escalada, mas também exige atenção aos veículos e perfis que podem transformar uma demanda local em pauta pública."
  }

  const criticos = data.atores.filter((a) => a.postura === "crítico").slice(0, 3)
  const aliados = data.atores.filter((a) => a.postura === "aliado").slice(0, 2)
  const neutros = data.atores.filter((a) => a.postura === "neutro").slice(0, 2)

  const trechos = []
  if (criticos.length) {
    trechos.push(`Os atores críticos mais relevantes são ${criticos.map((a) => `${nomeLimpo(a.nome)}, com ${quantidade(a.total, "publicação", "publicações")} e ${quantidadeFmt(a.engajamento, "interação", "interações")}`).join("; ")}.`)
  }
  if (aliados.length) {
    trechos.push(`Há validadores favoráveis em ${aliados.map((a) => nomeLimpo(a.nome)).join(", ")}, úteis para amplificar entregas sem transformar a comunicação em confronto.`)
  }
  if (!criticos.length && neutros.length) {
    trechos.push(`O debate está mais informativo do que polarizado, com perfis como ${neutros.map((a) => nomeLimpo(a.nome)).join(", ")} funcionando como distribuidores de agenda.`)
  }

  trechos.push("A estratégia recomendada é mapear histórico e credibilidade de cada ator antes de qualquer resposta pública. Nem todo crítico deve ser respondido; alguns devem apenas ser monitorados.")
  return trechos.join(" ")
}

function leituraAgenda(data: IntelligenceOverview): string[] {
  if (data.recomendacoes.length) {
    return data.recomendacoes
      .slice(0, 4)
      .map((r) => `${r.acao}. ${r.proximo_passo}`)
  }

  const crise = data.crises[0]
  if (crise) {
    return [
      `Abrir acompanhamento de ${crise.tema}.`,
      "Separar evidências, local, órgão responsável e providência verificável.",
      "Evitar resposta pública antes de confirmar o fato operacional.",
    ]
  }

  return [
    "Manter monitoramento ativo.",
    "Reforçar comunicação de entregas com território, dado e evidência.",
    "Não forçar narrativa onde a base ainda não mostra movimento real.",
  ]
}

function confiabilidade(data: IntelligenceOverview): string {
  const audit = data.auditoria_ia
  const uteis = audit.mencoes_uteis ?? data.briefing.kpis.total
  const curadas = audit.mencoes_curadas_politicas ?? data.briefing.kpis.total
  const rejeitadas = audit.mencoes_rejeitadas_curadoria ?? 0
  return `Esta análise considera ${curadas} menções políticas curadas dentro de ${uteis} menções úteis. Outras ${rejeitadas} menções foram mantidas fora da leitura estratégica por ruído, ausência de vínculo municipal claro ou risco de falso positivo. A leitura privilegia consistência sobre volume bruto.`
}

function AnaliseArticle({ data }: { data: IntelligenceOverview }) {
  const periodo = periodoLabel(data)
  const agenda = leituraAgenda(data)

  return (
    <article className="bg-brand-800 border border-brand-600 rounded-lg shadow-[var(--shadow-card)]">
      <div className="px-6 md:px-10 py-8 md:py-10 border-b border-brand-600">
        <p className="text-sm text-brand-300 font-semibold uppercase tracking-wider">Análise de conjuntura</p>
        <h1 className="text-3xl md:text-5xl font-bold text-white mt-3 tracking-tight leading-tight">
          O ambiente político de Belém no período
        </h1>
        <p className="text-base md:text-lg text-slate-400 mt-4 leading-8 max-w-5xl">
          Leitura editorial baseada em menções curadas sobre Prefeitura de Belém, Igor Normando, órgãos municipais e serviços públicos.
          Período analisado: {periodo}.
        </p>
      </div>

      <div className="px-6 md:px-10 py-8 md:py-10 space-y-0">
        <section className="max-w-5xl space-y-5">
          <h2 className="text-2xl font-bold text-white">Síntese</h2>
          <p className="text-xl text-slate-300 leading-9">{leituraAmbiente(data)}</p>
        </section>

        <section className="max-w-5xl space-y-5 pt-12 mt-12 border-t border-brand-600">
          <h2 className="text-2xl font-bold text-white">A temperatura da crise</h2>
          <p className="text-lg text-slate-300 leading-8">{maturidadeCrises(data)}</p>
        </section>

        <section className="max-w-5xl space-y-5 pt-12 mt-12 border-t border-brand-600">
          <h2 className="text-2xl font-bold text-white">Narrativas em disputa</h2>
          <p className="text-lg text-slate-300 leading-8">{leituraNarrativas(data)}</p>
        </section>

        <section className="max-w-5xl space-y-5 pt-12 mt-12 border-t border-brand-600">
          <h2 className="text-2xl font-bold text-white">Atores e dinâmica política</h2>
          <p className="text-lg text-slate-300 leading-8">{leituraAtores(data)}</p>
        </section>

        <section className="max-w-5xl space-y-5 pt-12 mt-12 border-t border-brand-600">
          <h2 className="text-2xl font-bold text-white">Encaminhamento editorial e político</h2>
          <ol className="list-decimal pl-6 space-y-4 text-lg text-slate-300 leading-8">
            {agenda.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <section className="max-w-5xl pt-10 mt-12 border-t border-brand-600">
          <h2 className="text-base font-semibold text-white">Nota metodológica</h2>
          <p className="text-sm text-slate-500 leading-7 mt-2">{confiabilidade(data)}</p>
        </section>
      </div>
    </article>
  )
}

export function Analise() {
  const hoje = new Date()
  const [dataInicio, setDataInicio] = useState(format(subDays(hoje, 6), "yyyy-MM-dd"))
  const [dataFim, setDataFim] = useState(format(hoje, "yyyy-MM-dd"))
  const [data, setData] = useState<IntelligenceOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState("")

  const load = useCallback(() => {
    setLoading(true)
    setErro("")
    intelligenceApi.overview({ data_inicio: dataInicio, data_fim: dataFim, monitoramento: "todos" })
      .then(setData)
      .catch((e) => setErro(e?.response?.data?.detail || e.message || "Erro ao carregar análise"))
      .finally(() => setLoading(false))
  }, [dataFim, dataInicio])

  useEffect(() => { load() }, [load])

  const subtitulo = useMemo(() => {
    if (!data) return "Leitura política textual"
    const curadas = data.auditoria_ia.mencoes_curadas_politicas ?? data.briefing.kpis.total
    return `${curadas} menções políticas curadas alimentam esta leitura`
  }, [data])

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1500px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Análise Política</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitulo}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 shadow-[var(--shadow-card)]">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-36"
            />
          </div>
          <span className="text-slate-500 text-base">até</span>
          <div className="flex items-center gap-2 bg-brand-800 border border-brand-600 rounded-lg px-4 py-3 shadow-[var(--shadow-card)]">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="bg-transparent text-base text-slate-200 outline-none w-36"
            />
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 bg-brand-400 hover:bg-brand-300 text-white text-base font-semibold px-5 py-3 rounded-lg transition-colors shadow-sm"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
      </div>

      {erro && <Card><p className="text-red-400 text-sm">{erro}</p></Card>}

      {loading ? (
        <Card>
          <div className="flex items-center gap-3 text-slate-400">
            <div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Preparando análise de conjuntura...</span>
          </div>
        </Card>
      ) : data ? (
        <AnaliseArticle data={data} />
      ) : null}
    </div>
  )
}
