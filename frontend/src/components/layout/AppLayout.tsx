import { Navigate, Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { useAuth } from "../../store/auth"

export function AppLayout() {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-brand-900">
        <Outlet />
      </main>
    </div>
  )
}
