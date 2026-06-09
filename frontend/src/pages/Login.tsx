import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { login } from "../api/auth"
import { useAuth } from "../store/auth"
import { initTheme } from "../utils/theme"

export function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { login: storeLogin } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    initTheme()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      const data = await login({ email, password })
      storeLogin(data.access_token, data.role)
      navigate("/")
    } catch {
      setError("Email ou senha incorretos")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white tracking-tight">
            Politic<span className="text-brand-300">AI</span>
          </h1>
          <p className="text-slate-400 text-base mt-2">Inteligência política em tempo real</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-brand-800 border border-brand-600 rounded-lg p-8 space-y-6 shadow-[var(--shadow-card)]"
        >
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-brand-700 border border-brand-600 rounded-lg px-4 py-3 text-base text-white placeholder-slate-500 focus:outline-none focus:border-brand-300 transition-colors"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-brand-700 border border-brand-600 rounded-lg px-4 py-3 text-base text-white placeholder-slate-500 focus:outline-none focus:border-brand-300 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-white font-semibold py-3 rounded-lg text-base transition-colors"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  )
}
