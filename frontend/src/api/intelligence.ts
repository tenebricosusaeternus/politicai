import { api } from "./client"

export interface IntelligenceBriefing {
  titulo: string
  resumo: string
  whatsapp: string
  kpis: {
    total: number
    positivas: number
    negativas: number
    score_sentimento: number
  }
}

export interface CrisisEvidence {
  id: number
  texto: string
  link: string
  plataforma: string
  publicador: string
  engajamento: number
}

export interface CrisisRoomItem {
  tema: string
  categoria?: string
  assunto?: string
  local_ou_orgao?: string
  termos?: string[]
  nivel?: "potencial" | "incubacao" | "instalada"
  score: number
  status: string
  mencoes: number
  engajamento: number
  plataformas: string[]
  evidencias: CrisisEvidence[]
  resposta_sugerida: string
}

export interface ActorItem {
  nome: string
  link: string
  postura: "crítico" | "aliado" | "neutro"
  total: number
  positivas: number
  negativas: number
  score_sentimento: number
  engajamento: number
  plataformas: string[]
}

export interface NarrativeItem {
  nome: string
  total: number
  positivas: number
  negativas: number
  neutras: number
  score_sentimento: number
  engajamento: number
  termos: string[]
}

export interface RecommendationItem {
  prioridade: "alta" | "media" | "baixa"
  acao: string
  motivo: string
  proximo_passo: string
}

export interface IntelligenceDay {
  data: string
  total: number
  positivas: number
  negativas: number
}

export interface EditorialPlanItem {
  dia: string
  tema: string
  formato: string
  objetivo: string
  gancho: string
  prioridade: "alta" | "media" | "baixa"
}

export interface OfficialGapItem {
  tema: string
  demanda_publica: number
  sentimento: number
  termos_publicos: string[]
  termos_oficiais: string[]
}

export interface OfficialComparison {
  posts_oficiais: number
  engajamento_oficial: number
  termos_oficiais: string[]
  lacunas: OfficialGapItem[]
  alinhamentos: OfficialGapItem[]
}

export interface TerritoryItem {
  local: string
  total: number
  positivas: number
  negativas: number
  score_sentimento: number
  engajamento: number
}

export interface ResponseDraftItem {
  origem: string
  status: string
  canal: string
  tom: string
  mensagem: string
}

export interface AiAudit {
  mencoes_periodo: number
  mencoes_uteis?: number
  mencoes_curadas_politicas?: number
  mencoes_rejeitadas_curadoria?: number
  mencoes_processadas_periodo?: number
  llm_processadas: number
  llm_pendentes: number
  correcoes_manuais: number
  classificacoes_auto: number
  taxa_correcao_manual: number
  divergencias: { par: string; total: number }[]
}

export interface IntelligenceOverview {
  periodo: {
    inicio: string
    fim: string
    monitoramento: string
  }
  briefing: IntelligenceBriefing
  crises: CrisisRoomItem[]
  atores: ActorItem[]
  narrativas: NarrativeItem[]
  recomendacoes: RecommendationItem[]
  calendario_editorial: EditorialPlanItem[]
  comparativo_oficial: OfficialComparison
  mapa_territorial: TerritoryItem[]
  gestao_respostas: ResponseDraftItem[]
  auditoria_ia: AiAudit
  serie: IntelligenceDay[]
}

export const intelligenceApi = {
  overview(params: {
    data_inicio?: string
    data_fim?: string
    monitoramento?: string
  }): Promise<IntelligenceOverview> {
    return api.get("/intelligence/overview", { params }).then((r) => r.data)
  },
}
