import { useState } from "react"
import type { FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { login } from "../api/auth"
import { useAuth } from "../store/auth"

export function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { login: storeLogin } = useAuth()
  const navigate = useNavigate()

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
    <div className="min-h-screen bg-brand-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Politic<span className="text-brand-300">AI</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2">Inteligência Política em Tempo Real</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-brand-800 border border-brand-600 rounded-2xl p-8 space-y-5"
        >
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-brand-700 border border-brand-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-300 transition-colors"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-brand-700 border border-brand-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-300 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  )
}
