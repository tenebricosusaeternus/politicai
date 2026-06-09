import { useCallback, useEffect, useState } from "react"
import { api } from "../api/client"
import { Card } from "../components/ui/Card"
import { useAuth } from "../store/auth"
import { Navigate } from "react-router-dom"
import { UserCheck, UserX } from "lucide-react"

interface User {
  id: number
  name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export function Admin() {
  const { role } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    api.get<User[]>("/admin/users").then((r) => {
      setUsers(r.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  const toggleUser = (id: number) => {
    api.patch(`/admin/users/${id}/toggle-active`).then(load)
  }

  if (role !== "admin") return <Navigate to="/" replace />

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1800px] mx-auto">
      <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Gestão de Usuários</h1>

      <Card>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-base">
            <thead>
              <tr className="text-sm text-slate-500 uppercase tracking-wider border-b border-brand-600">
                <th className="text-left pb-3 font-medium">Nome</th>
                <th className="text-left pb-3 font-medium">Email</th>
                <th className="text-left pb-3 font-medium">Perfil</th>
                <th className="text-left pb-3 font-medium">Status</th>
                <th className="text-left pb-3 font-medium">Cadastro</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-brand-700/30 transition-colors">
                  <td className="py-3 text-slate-200 font-medium">{u.name}</td>
                  <td className="py-3 text-slate-400">{u.email}</td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      u.role === "admin"
                        ? "bg-brand-500/20 text-brand-300 border-brand-400/30"
                        : "bg-slate-700/40 text-slate-400 border-slate-600/30"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      u.is_active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                    }`}>
                      {u.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="py-3 text-slate-500 text-sm">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => toggleUser(u.id)}
                      className="p-2 rounded-lg hover:bg-brand-600 transition-colors text-slate-400 hover:text-white"
                      title={u.is_active ? "Desativar" : "Ativar"}
                    >
                      {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
