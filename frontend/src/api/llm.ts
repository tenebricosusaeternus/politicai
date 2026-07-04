import { api } from "./client"

export interface LlmInstance {
  id: string
  name: string
  task: string
  model_alias: string
  thinking: boolean
  temperature: number
  max_tokens: number
  prompt_version: string
  schema_version: string
  output_mode: string
  risk: string
  fallback: string
  human_audit: string
  active_model?: string
}

export interface LlmRegistry {
  models: Record<string, string>
  instances: LlmInstance[]
  prompts: { version: string; filename: string; size: number }[]
  schemas: { version: string; filename: string; size: number }[]
  golden_dataset: { name: string; count: number }
}

export interface LlmInstanceDetail {
  id: string
  config: LlmInstance
  prompt: string
  schema: unknown
}

export interface GoldenMention {
  id: string
  texto: string
  classe_esperada: string
  tema_esperado: string | null
  entidades_esperadas: string[]
  motivo: string
  prioridade: string
}

export interface ClassificationTestResult {
  ok: boolean
  model?: string
  prompt_version?: string
  raw_output?: string
  accuracy?: number | null
  error?: string
  results?: {
    id: string
    texto: string
    classe_esperada?: string
    classe_prevista?: string
    ok?: boolean | null
  }[]
}

export const llmApi = {
  registry(): Promise<LlmRegistry> {
    return api.get("/llm/registry").then((r) => r.data)
  },
  instance(id: string): Promise<LlmInstanceDetail> {
    return api.get(`/llm/instances/${id}`).then((r) => r.data)
  },
  golden(limit = 50): Promise<{ name: string; items: GoldenMention[] }> {
    return api.get("/llm/golden", { params: { limit } }).then((r) => r.data)
  },
  testClassification(useGoldenSample = true): Promise<ClassificationTestResult> {
    return api.post("/llm/test/classification", { items: [], use_golden_sample: useGoldenSample }).then((r) => r.data)
  },
}
