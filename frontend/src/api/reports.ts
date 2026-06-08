import { api } from "./client"

export interface Report {
  id: number
  title: string
  summary: string | null
  content: string | null
  crisis_score: number | null
  sentiment_score: number | null
  report_date: string
  ai_insights: Record<string, unknown> | null
  created_at: string
}

export interface CrisisPoint {
  date: string
  crisis_score: number | null
  sentiment_score: number | null
}

export const getToday = () => api.get<Report>("/reports/today").then((r) => r.data)

export const getByDate = (date: string) =>
  api.get<Report>(`/reports/${date}`).then((r) => r.data)

export const listReports = (dateFrom?: string, dateTo?: string) =>
  api.get<Report[]>("/reports/", { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data)

export const getCrisisHistory = (dateFrom?: string, dateTo?: string) =>
  api.get<CrisisPoint[]>("/reports/crisis-history/", { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data)
