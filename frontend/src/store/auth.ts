import { create } from "zustand"

interface AuthState {
  token: string | null
  role: string | null
  login: (token: string, role: string) => void
  logout: () => void
}

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem("token"),
  role: localStorage.getItem("role"),
  login: (token, role) => {
    localStorage.setItem("token", token)
    localStorage.setItem("role", role)
    set({ token, role })
  },
  logout: () => {
    localStorage.removeItem("token")
    localStorage.removeItem("role")
    set({ token: null, role: null })
  },
}))
