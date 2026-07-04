import { api } from "./client"

export interface PoliticalEvent {
  id: number
  title: string
  description: string | null
  source: string
  source_url: string | null
  severity: "low" | "medium" | "high" | "critical"
  sentiment_score: number | null
  actors: string[] | null
  tags: string[] | null
  location: string | null
  event_date: string
  raw_data?: {
    crisis_status?: "candidate" | "approved" | "rejected" | "monitoring" | "resolved"
    crisis_candidate_key?: string
    crisis_payload?: CrisisCandidate
    manual?: boolean
    rejection_reason?: string
  } | null
  created_at: string
}

export interface CrisisCandidate {
  tema: string
  categoria: string
  assunto: string
  local_ou_orgao: string
  termos: string[]
  nivel: "potencial" | "incubacao" | "instalada"
  score: number
  status: string
  mencoes: number
  engajamento: number
  plataformas: string[]
  evidencias: Array<{
    id: number
    texto: string
    link: string
    plataforma: string
    publicador: string
    engajamento: number
  }>
  resposta_sugerida: string
  candidate_key: string
  curation_status: "candidate" | "approved" | "rejected" | "monitoring" | "resolved"
}

export const getEventsToday = () =>
  api.get<PoliticalEvent[]>("/events/today").then((r) => r.data)

export const listEvents = (params: {
  date_from?: string
  date_to?: string
  severity?: string
  location?: string
  status?: string
}) => api.get<PoliticalEvent[]>("/events/", { params }).then((r) => r.data)

export const listCrisisCandidates = (params: {
  date_from?: string
  date_to?: string
}) => api.get<CrisisCandidate[]>("/events/crisis-candidates", { params }).then((r) => r.data)

export const approveCrisisCandidate = (crise: CrisisCandidate) =>
  api.post<PoliticalEvent>("/events/crisis-candidates/approve", { crise }).then((r) => r.data)

export const rejectCrisisCandidate = (crise: CrisisCandidate, reason = "") =>
  api.post<PoliticalEvent>("/events/crisis-candidates/reject", { crise, reason }).then((r) => r.data)

export const createEvent = (payload: {
  title: string
  description?: string
  severity: string
  location?: string
  source_url?: string
  event_date?: string
  tags?: string[]
  actors?: string[]
  status?: string
}) => api.post<PoliticalEvent>("/events/", payload).then((r) => r.data)

export const updateEvent = (id: number, payload: Record<string, unknown>) =>
  api.patch<PoliticalEvent>(`/events/${id}`, payload).then((r) => r.data)
