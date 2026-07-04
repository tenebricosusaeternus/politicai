import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AppLayout } from "./components/layout/AppLayout"
import { Login } from "./pages/Login"
import { Dashboard } from "./pages/Dashboard"
import { Reports } from "./pages/Reports"
import { RelatorioDetalhe } from "./pages/RelatorioDetalhe"
import { Events } from "./pages/Events"
import { Admin } from "./pages/Admin"
import { Mencoes } from "./pages/Mencoes"
import { Inteligencia } from "./pages/Inteligencia"
import { Operacao } from "./pages/Operacao"
import { LlmOps } from "./pages/LlmOps"
import { Analise } from "./pages/Analise"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mencoes" element={<Mencoes />} />
          <Route path="/inteligencia" element={<Inteligencia />} />
          <Route path="/analise" element={<Analise />} />
          <Route path="/operacao" element={<Operacao />} />
          <Route path="/llm" element={<LlmOps />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/:id" element={<RelatorioDetalhe />} />
          <Route path="/events" element={<Events />} />
          <Route path="/admin" element={<Admin />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
