import { Component } from "react"
import type { ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"

interface Props {
  children: ReactNode
}
interface State {
  erro: Error | null
}

/**
 * Captura erros de renderização de qualquer página filha e mostra uma tela
 * de recuperação, em vez de desmontar a aplicação inteira (tela branca).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error, info: unknown) {
    console.error("Erro de renderização capturado:", erro, info)
  }

  reset = () => this.setState({ erro: null })

  render() {
    if (this.state.erro) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center">
            <AlertTriangle size={26} className="text-red-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">Algo deu errado nesta página</h2>
            <p className="text-sm text-slate-400 max-w-md">
              Um erro impediu a exibição do conteúdo. As outras páginas continuam funcionando.
            </p>
          </div>
          <pre className="text-xs text-slate-500 bg-brand-800 border border-brand-600 rounded-lg px-3 py-2 max-w-lg overflow-auto">
            {this.state.erro.message}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-brand-400 hover:bg-brand-300 text-white transition-colors"
            >
              <RotateCcw size={14} /> Tentar novamente
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="text-sm font-medium px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-slate-200 transition-colors"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
