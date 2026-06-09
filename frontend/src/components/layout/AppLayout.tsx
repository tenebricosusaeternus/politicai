import { useEffect, useState } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { Menu } from "lucide-react"
import { Sidebar } from "./Sidebar"
import { ErrorBoundary } from "../ErrorBoundary"
import { useAuth } from "../../store/auth"
import { initTheme } from "../../utils/theme"

export function AppLayout() {
  const { token } = useAuth()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    initTheme()
  }, [])

  if (!token) return <Navigate to="/login" replace />

  return (
    <div className="app-shell flex min-h-screen">
      {/* Sidebar desktop — sempre visível em md+ */}
      <div className="hidden md:flex md:w-60 md:flex-shrink-0">
        <Sidebar />
      </div>

      {/* Drawer mobile — overlay quando aberto */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Painel */}
          <div className="absolute left-0 top-0 h-full w-72 shadow-2xl">
            <Sidebar onClose={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* Área de conteúdo */}
      <div className="app-shell flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="md:hidden flex items-center justify-between px-4 h-16 bg-brand-800 border-b border-brand-600 sticky top-0 z-30 flex-shrink-0 shadow-[var(--shadow-card)]">
          <span className="text-base font-bold text-white tracking-tight">
            Politic<span className="text-brand-300">AI</span>
          </span>
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-brand-700 transition-colors"
          >
            <Menu size={20} />
          </button>
        </header>

        <main className="flex-1 overflow-auto">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
