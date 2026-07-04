import { api } from "./client"

export interface RelatorioListItem {
  id: number
  titulo: string
  periodo_inicio: string
  periodo_fim: string
  nivel_alerta: number
  status: "rascunho" | "publicado"
  created_at: string | null
}

export interface CrisisPoint {
  date: string
  crisis_score: number | null
  sentiment_score: number | null
}

export interface TemaItem {
  titulo: string
  descricao: string
  alcance: string
  interacoes: string
  polaridade: string
  tendencia: string
  fontes: string[]
}

export interface DestaquesAlerta {
  titulo: string
  descricao: string
  alcance: string
  interacoes: string
  fontes: string[]
}

export interface CanalPerformance {
  nome: string
  interacoes: string
}

export interface PerformanceDigital {
  interacoes_total: string
  novos_seguidores: string
  engajamento_taxa: string
  canais: CanalPerformance[]
  analise: string
  destaque: string
}

export interface Tendencias {
  google: string
  twitter: string
  youtube: string
}

export interface Recomendacao {
  numero: number
  titulo: string
  descricao: string
}

export interface ResumoItem {
  titulo: string
  texto: string
}

// ─── Blocos (editor) ─────────────────────────────────────────────────────────

export type BlocoTipo =
  | "titulo" | "texto" | "imagem" | "grafico" | "callout" | "metricas" | "divisoria"
  | "hero_resumo" | "sentimento_painel" | "performance_oficial" | "top_posts" | "temas_principais"

export interface MetricaItem { label: string; valor: string; sub?: string }
export interface GraficoSerie { nome: string; dados: number[] }
export interface GraficoDados {
  variante: "bar" | "line" | "pie"
  titulo?: string
  categorias: string[]
  series: GraficoSerie[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Bloco { id: string; tipo: BlocoTipo; dados: any }

export interface RelatorioDetail extends RelatorioListItem {
  nivel_alerta_justificativa: string | null
  temas: { principal: TemaItem; secundarios: TemaItem[] } | null
  destaques: DestaquesAlerta[] | null
  alertas: DestaquesAlerta[] | null
  performance_prefeitura: PerformanceDigital | null
  performance_igor: PerformanceDigital | null
  tendencias: Tendencias | null
  recomendacoes: Recomendacao[] | null
  resumo: ResumoItem[] | null
  blocos: Bloco[] | null
  gerado_por_llm: string | null
  updated_at: string | null
}

export interface ReportJob {
  id: string
  status: "queued" | "running" | "completed" | "failed"
  progress: number
  message: string
  relatorio_id: number | null
  error: string | null
  periodo_inicio: string
  periodo_fim: string
}

/** Origem do backend (para resolver URLs de /uploads). */
export const BACKEND_ORIGIN = (api.defaults.baseURL || "http://localhost:8000/api/v1")
  .replace(/\/api\/v1\/?$/, "")

/** Resolve uma URL de imagem do relatório (/uploads/... → absoluta). */
export function resolverImagem(url: string): string {
  if (!url) return ""
  if (url.startsWith("http") || url.startsWith("data:")) return url
  return `${BACKEND_ORIGIN}${url}`
}

export const reportsApi = {
  listar: (offset = 0, limit = 30) =>
    api.get<{ total: number; items: RelatorioListItem[] }>(`/reports/?offset=${offset}&limit=${limit}`)
      .then((r) => r.data),

  get: (id: number) =>
    api.get<RelatorioDetail>(`/reports/${id}`).then((r) => r.data),

  gerar: (periodo_inicio: string, periodo_fim?: string) =>
    api.post<RelatorioDetail>("/reports/gerar", { periodo_inicio, periodo_fim })
      .then((r) => r.data),

  gerarBackground: (periodo_inicio: string, periodo_fim?: string) =>
    api.post<ReportJob>("/reports/gerar-background", { periodo_inicio, periodo_fim })
      .then((r) => r.data),

  job: (jobId: string) =>
    api.get<ReportJob>(`/reports/jobs/${jobId}`).then((r) => r.data),

  atualizar: (id: number, payload: Record<string, unknown>) =>
    api.patch<RelatorioDetail>(`/reports/${id}`, payload).then((r) => r.data),

  deletar: (id: number) =>
    api.delete(`/reports/${id}`).then((r) => r.data),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gerarBloco: (id: number, tipo: BlocoTipo, instrucao: string): Promise<{ dados: any }> =>
    api.post(`/reports/${id}/gerar-bloco`, { tipo, instrucao }).then((r) => r.data),

  uploadImagem: (file: File): Promise<{ url: string }> => {
    const fd = new FormData()
    fd.append("file", file)
    return api.post("/reports/upload-imagem", fd).then((r) => r.data)
  },
}
