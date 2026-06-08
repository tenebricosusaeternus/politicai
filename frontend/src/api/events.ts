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
  created_at: string
}

export const getEventsToday = () =>
  api.get<PoliticalEvent[]>("/events/today").then((r) => r.data)

export const listEvents = (params: {
  date_from?: string
  date_to?: string
  severity?: string
  location?: string
}) => api.get<PoliticalEvent[]>("/events/", { params }).then((r) => r.data)
