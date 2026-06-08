import { NavLink, useNavigate } from "react-router-dom"
import { LayoutDashboard, FileText, Zap, Users, LogOut } from "lucide-react"
import { useAuth } from "../../store/auth"

const nav = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/reports", icon: FileText, label: "Relatórios" },
  { to: "/events", icon: Zap, label: "Eventos" },
]

export function Sidebar() {
  const { role, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  return (
    <aside className="w-60 min-h-screen bg-brand-800 border-r border-brand-600 flex flex-col">
      <div className="px-6 py-5 border-b border-brand-600">
        <span className="text-lg font-bold text-white tracking-tight">Politic<span className="text-brand-300">AI</span></span>
        <p className="text-xs text-slate-400 mt-0.5">Inteligência Política</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-brand-500 text-white font-medium"
                  : "text-slate-400 hover:text-white hover:bg-brand-700"
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}

        {role === "admin" && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-brand-500 text-white font-medium"
                  : "text-slate-400 hover:text-white hover:bg-brand-700"
              }`
            }
          >
            <Users size={16} />
            Usuários
          </NavLink>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-brand-600">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-brand-700 transition-colors"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  )
}
