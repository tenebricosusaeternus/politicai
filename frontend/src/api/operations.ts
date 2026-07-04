import { api } from "./client"

export interface HygieneReason {
  reason: string
  action: string
  total: number
}

export interface HygieneSample {
  id: number
  mencao_id: number
  reason: string
  action: string
  label: string
  text_snapshot: string
  plataforma: string
  publicador_nome: string
  created_at: string
  reversed_at: string | null
}

export interface HygieneSummary {
  periodo_dias: number
  total_filtrado: number
  economia_tokens_estimada: number
  motivos: HygieneReason[]
  samples: HygieneSample[]
}

export interface CrisisCase {
  id: number
  title: string
  theme: string | null
  status: string
  priority: string
  owner: string | null
  due_date: string | null
  evidence: unknown[]
  response_draft: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string | null
}

export interface PoliticalEntity {
  id: number
  name: string
  kind: string
  aliases: string[]
  stance: string
  notes: string | null
  active: boolean
}

export interface AiAudit {
  total_mencoes: number
  llm_processadas: number
  llm_pendentes: number
  correcoes_manuais: number
  taxa_correcao_manual: number
  divergencias: { from: string; to: string; total: number }[]
}

export const operationsApi = {
  hygieneSummary(days = 7): Promise<HygieneSummary> {
    return api.get("/operations/hygiene/summary", { params: { days } }).then((r) => r.data)
  },
  runHygiene(limite = 1000) {
    return api.post("/operations/hygiene/run", limite).then((r) => r.data)
  },
  revertHygiene(auditId: number) {
    return api.post(`/operations/hygiene/${auditId}/revert`).then((r) => r.data)
  },
  listCrises(): Promise<CrisisCase[]> {
    return api.get("/operations/crises").then((r) => r.data)
  },
  createCrisis(payload: Partial<CrisisCase>) {
    return api.post("/operations/crises", payload).then((r) => r.data)
  },
  updateCrisis(id: number, payload: Partial<CrisisCase>) {
    return api.patch(`/operations/crises/${id}`, payload).then((r) => r.data)
  },
  listEntities(): Promise<PoliticalEntity[]> {
    return api.get("/operations/entities").then((r) => r.data)
  },
  createEntity(payload: Partial<PoliticalEntity>) {
    return api.post("/operations/entities", payload).then((r) => r.data)
  },
  aiAudit(): Promise<AiAudit> {
    return api.get("/operations/ai-audit").then((r) => r.data)
  },
  reprocessAi(maxTotal = 100) {
    return api.post("/operations/ai-audit/reprocess", maxTotal).then((r) => r.data)
  },
}
