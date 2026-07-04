import { useEffect, useState } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { Activity, FileText, Users, LogOut, Radio, X, Moon, Sun, ShieldAlert, ClipboardList, BrainCircuit, BarChart3 } from "lucide-react"
import { useAuth } from "../../store/auth"
import { applyTheme, getStoredTheme } from "../../utils/theme"

const nav = [
  { to: "/", icon: Activity, label: "Hoje" },
  { to: "/mencoes", icon: Radio, label: "Menções" },
  { to: "/inteligencia", icon: ShieldAlert, label: "Inteligência" },
  { to: "/analise", icon: BarChart3, label: "Análise" },
  { to: "/operacao", icon: ClipboardList, label: "Operação" },
  { to: "/llm", icon: BrainCircuit, label: "LLM" },
  { to: "/reports", icon: FileText, label: "Relatórios" },
  { to: "/events", icon: ShieldAlert, label: "Crises" },
]

interface Props {
  onClose?: () => void
}

export function Sidebar({ onClose }: Props) {
  const { role, logout } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] transition-colors ${
      isActive
        ? "bg-brand-400 text-white font-semibold shadow-sm"
        : "text-slate-400 hover:text-white hover:bg-brand-700"
    }`

  return (
    <aside className="w-full h-full bg-brand-800 border-r border-brand-600 flex flex-col shadow-[var(--shadow-card)]">
      {/* Logo + botão fechar (mobile) */}
      <div className="px-6 py-5 border-b border-brand-600 flex items-center justify-between">
        <div>
          <span className="text-xl font-bold text-white tracking-tight">
            Politic<span className="text-brand-300">AI</span>
          </span>
          <p className="text-sm text-slate-400 mt-0.5">War room político</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden text-slate-500 hover:text-white p-1 rounded-lg hover:bg-brand-700 transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1.5">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"} className={linkClass} onClick={onClose}>
            <Icon size={16} />
            {label}
          </NavLink>
        ))}

        {role === "admin" && (
          <NavLink to="/admin" className={linkClass} onClick={onClose}>
            <Users size={16} />
            Usuários
          </NavLink>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-brand-600 space-y-2">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg text-[15px] text-slate-400 hover:text-white hover:bg-brand-700 transition-colors"
          title="Alternar tema"
        >
          <span className="flex items-center gap-3">
            {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
            Tema
          </span>
          <span className="text-sm">{theme === "dark" ? "Escuro" : "Claro"}</span>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-[15px] text-slate-400 hover:text-white hover:bg-brand-700 transition-colors"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  )
}
