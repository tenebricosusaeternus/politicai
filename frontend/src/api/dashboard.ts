import { api } from "./client"

export type Monitoramento =
  | "radar_belem"
  | "boletim_belem"
  | "todos"

export interface ResumoSentimentos {
  monitoramento_id: number
  nome: string
  periodo?: string
  total: number
  positivas: number
  neutras: number
  negativas: number
  sem_qualificacao: number
  score_sentimento?: number
  impressoes: number
  pessoas_alcancadas: number
  publicadores: number
  slug?: string
  erro?: string
}

export interface ResumoDia extends ResumoSentimentos {
  data: string
}

export interface SerieTemporal {
  monitoramento: string
  serie: ResumoDia[]
}

export type Sentimento = "POSITIVA" | "NEGATIVA" | "NEUTRA" | "SEM_QUALIFICACAO" | "IRRELEVANTE"

export interface Mencao {
  id: number
  monitoramento_id?: number
  texto: string
  link: string
  data: string
  plataforma: string
  publicador_nome: string
  publicador_link: string
  sentimento: Sentimento
  sentimento_vtracker: Sentimento
  corrigido: boolean
  observacao_correcao: string | null
  source?: string
  classe: string
  acuracia: number
  likes: number
  shares: number
  comentarios: number
  tipo_conteudo: string
  localizacao: string
  thumbnail: string
}

export interface ListaMencoes {
  total: number
  paginas: number
  pagina: number
  items: Mencao[]
}

export interface Tema {
  slug: string
  nome: string
  total: number
  positivas: number
  negativas: number
  neutras: number
  pct_positivo: number
  pct_negativo: number
}

export interface ResumoTemas {
  mencoes_analisadas: number
  temas: Tema[]
}

export interface Palavra {
  texto: string
  frequencia: number
  sentimento: Sentimento
  positivas: number
  negativas: number
  neutras: number
}

export interface ResumoNuvem {
  total_mencoes: number
  palavras: Palavra[]
}

export interface PublicadorItem {
  nome: string
  link: string
  total: number
  positivas: number
  negativas: number
  neutras: number
  sem_qualificacao: number
  score_sentimento: number
  engajamento: number
  plataformas: string[]
}
export interface ResumoPublicadores {
  mencoes_analisadas: number
  publicadores: PublicadorItem[]
}

export interface PlataformaItem {
  nome: string
  total: number
  positivas: number
  negativas: number
  neutras: number
  sem_qualificacao: number
  score_sentimento: number
  engajamento_total: number
  impressoes_estimadas: number
}
export interface ResumoPlataformas {
  mencoes_analisadas: number
  plataformas: PlataformaItem[]
}

export interface PeriodoVelocidade {
  inicio: string
  fim: string
  total: number
  positivas: number
  negativas: number
  neutras: number
  score_sentimento: number
}
export interface ResumoVelocidade {
  periodo_atual: PeriodoVelocidade
  periodo_anterior: PeriodoVelocidade
  variacao_total_pct: number | null
  variacao_positivas_pct: number | null
  variacao_negativas_pct: number | null
  variacao_score_pts: number | null
}

export type HeatmapModo = "volume" | "sentimento"
export interface ResumoHeatmap {
  mencoes_analisadas: number
  modo: HeatmapModo
  dias_semana: string[]
  horas: number[]
  matriz: (number | null)[][]
}

export interface SyncStatus {
  total_mencoes: number
  llm_pendentes: number
  llm_processadas: number
  ultima_sincronizacao: string | null
  ultimo_status: string | null
  ultimo_resultado: string | null
  data_mais_antiga: string | null
  data_mais_recente: string | null
}

export interface InsightPerfil {
  seguidores: number
  saldo_seguidores: number
  alcance: number
  impressoes: number
  impressoes_organicas: number
  follows: number
  unfollows: number
  views: number
}

export interface InsightPostagens {
  total_posts: number
  likes: number
  comentarios: number
  compartilhamentos: number
  salvos: number
  love: number
  haha: number
  wow: number
  sad: number
  angry: number
  engajamento_total: number
}

export interface InsightTopPost {
  id: string
  data: string
  tipo: string
  texto: string
  link: string
  thumbnail: string
  likes: number
  comentarios: number
  compartilhamentos: number
  salvos: number
  reacoes: number
  engajamento: number
  rede?: string
  conta?: string
}

export interface InsightVariacao {
  atual: number
  anterior: number
  delta: number
  pct: number | null
}

export interface InsightConta {
  id: number
  nome: string
  rede: string
  imagem: string
  perfil: InsightPerfil
  postagens: InsightPostagens
  crescimento: {
    seguidores: InsightVariacao
    alcance_ou_impressoes: InsightVariacao
    engajamento: InsightVariacao
    posts: InsightVariacao
  } | null
  top_posts: InsightTopPost[]
}

export interface InsightsOficiais {
  periodo: { inicio: string; fim: string; anterior_inicio: string; anterior_fim: string }
  contas: InsightConta[]
  totais: {
    seguidores: number
    alcance: number
    impressoes: number
    engajamento: number
    posts: number
  }
  top_posts: InsightTopPost[]
}

export const dashboardApi = {
  syncStatus(): Promise<SyncStatus> {
    return api.get("/dashboard/sync/status").then((r) => r.data)
  },

  insightsOficiais(dataInicio?: string, dataFim?: string): Promise<InsightsOficiais> {
    const params: Record<string, string> = {}
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/insights/oficiais", { params }).then((r) => r.data)
  },

  sincronizar(dias = 2): Promise<{ ok: boolean; novos: number }> {
    return api.post("/dashboard/sync", null, { params: { dias } }).then((r) => r.data)
  },

  sentimentos(
    monitoramento: Monitoramento = "todos",
    dataInicio?: string,
    dataFim?: string,
  ): Promise<ResumoSentimentos> {
    const params: Record<string, string> = { monitoramento }
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/sentimentos", { params }).then((r) => r.data)
  },

  todosMonitoramentos(dataInicio?: string, dataFim?: string): Promise<ResumoSentimentos[]> {
    const params: Record<string, string> = {}
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/todos-monitoramentos", { params }).then((r) => r.data)
  },

  serieTemporal(
    monitoramento: Monitoramento = "todos",
    dataInicio?: string,
    dataFim?: string,
  ): Promise<SerieTemporal> {
    const params: Record<string, string> = { monitoramento }
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/serie-temporal", { params }).then((r) => r.data)
  },

  temas(
    monitoramento: Monitoramento = "todos",
    dataInicio?: string,
    dataFim?: string,
  ): Promise<ResumoTemas> {
    const params: Record<string, string | number> = { monitoramento, paginas: 5 }
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/temas", { params }).then((r) => r.data)
  },

  mencoesRecentes(opts: {
    monitoramento?: Monitoramento | "todos"
    dataInicio?: string
    dataFim?: string
    pagina?: number
    tamanho?: number
    incluirIrrelevantes?: boolean
  }): Promise<ListaMencoes> {
    const params: Record<string, string | number | boolean> = {
      monitoramento: opts.monitoramento ?? "todos",
      pagina: opts.pagina ?? 0,
      tamanho: opts.tamanho ?? 20,
      incluir_irrelevantes: opts.incluirIrrelevantes ?? false,
    }
    if (opts.dataInicio) params.data_inicio = opts.dataInicio
    if (opts.dataFim) params.data_fim = opts.dataFim
    return api.get("/dashboard/mencoes-recentes", { params }).then((r) => r.data)
  },

  corrigirSentimento(
    ocorrenciaId: number,
    sentimento: Sentimento,
    opts: {
      monitoramentoId: number
      textoSnapshot?: string
      plataforma?: string
      publicadorNome?: string
      sentimentoVtracker?: Sentimento
      observacao?: string
    },
  ): Promise<{ ok: boolean }> {
    return api
      .post(`/dashboard/mencoes/${ocorrenciaId}/sentimento`, {
        sentimento,
        monitoramento_id: opts.monitoramentoId,
        texto_snapshot: opts.textoSnapshot ?? "",
        plataforma: opts.plataforma ?? "",
        publicador_nome: opts.publicadorNome ?? "",
        sentimento_vtracker: opts.sentimentoVtracker ?? "NEUTRA",
        observacao: opts.observacao ?? "",
      })
      .then((r) => r.data)
  },

  removerCorrecao(ocorrenciaId: number): Promise<{ ok: boolean }> {
    return api.delete(`/dashboard/mencoes/${ocorrenciaId}/sentimento`).then((r) => r.data)
  },

  nuvemPalavras(
    monitoramento: Monitoramento = "todos",
    dataInicio?: string,
    dataFim?: string,
  ): Promise<ResumoNuvem> {
    const params: Record<string, string | number> = { monitoramento, paginas: 6, top: 80 }
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/nuvem-palavras", { params }).then((r) => r.data)
  },

  velocidade(
    monitoramento: Monitoramento = "todos",
    dataInicio?: string,
    dataFim?: string,
  ): Promise<ResumoVelocidade> {
    const params: Record<string, string> = { monitoramento }
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/velocidade", { params }).then((r) => r.data)
  },

  publicadores(
    monitoramento: Monitoramento = "todos",
    dataInicio?: string,
    dataFim?: string,
    paginas = 5,
    top = 15,
  ): Promise<ResumoPublicadores> {
    const params: Record<string, string | number> = { monitoramento, paginas, top }
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/publicadores", { params }).then((r) => r.data)
  },

  plataformas(
    monitoramento: Monitoramento = "todos",
    dataInicio?: string,
    dataFim?: string,
    paginas = 5,
  ): Promise<ResumoPlataformas> {
    const params: Record<string, string | number> = { monitoramento, paginas }
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/plataformas", { params }).then((r) => r.data)
  },

  heatmap(
    monitoramento: Monitoramento = "todos",
    dataInicio?: string,
    dataFim?: string,
    paginas = 5,
    modo: "volume" | "sentimento" = "volume",
  ): Promise<ResumoHeatmap> {
    const params: Record<string, string | number> = { monitoramento, paginas, modo }
    if (dataInicio) params.data_inicio = dataInicio
    if (dataFim) params.data_fim = dataFim
    return api.get("/dashboard/heatmap", { params }).then((r) => r.data)
  },

  reclassificar(opts: {
    monitoramento?: Monitoramento | "todos"
    dataInicio?: string
    dataFim?: string
    paginas?: number
  }): Promise<{ ok: boolean; processadas: number; atualizadas: number; mensagem: string }> {
    const params: Record<string, string | number> = {
      monitoramento: opts.monitoramento ?? "todos",
      paginas: opts.paginas ?? 2,
    }
    if (opts.dataInicio) params.data_inicio = opts.dataInicio
    if (opts.dataFim) params.data_fim = opts.dataFim
    return api.post("/dashboard/reclassificar", null, { params }).then((r) => r.data)
  },

  limparReclassificar(opts: {
    dataInicio?: string
    dataFim?: string
    paginas?: number
  }): Promise<{ ok: boolean; overrides_deletados: number; processadas: number; atualizadas: number; mensagem: string }> {
    const params: Record<string, string | number> = { paginas: opts.paginas ?? 5 }
    if (opts.dataInicio) params.data_inicio = opts.dataInicio
    if (opts.dataFim) params.data_fim = opts.dataFim
    return api.post("/dashboard/limpar-reclassificar", null, { params }).then((r) => r.data)
  },

  classificarTexto(texto: string): Promise<{ sentimento: Sentimento }> {
    return api.post("/dashboard/classificar-texto", { texto }).then((r) => r.data)
  },

  atualizarToken(token: string): Promise<{ ok: boolean; mensagem: string }> {
    return api.post("/dashboard/token", null, { params: { token } }).then((r) => r.data)
  },
}
