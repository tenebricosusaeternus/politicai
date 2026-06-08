import { api } from "./client"

export interface LoginPayload { email: string; password: string }
export interface TokenResponse { access_token: string; token_type: string; role: string }

export const login = (data: LoginPayload) =>
  api.post<TokenResponse>("/auth/login", data).then((r) => r.data)
