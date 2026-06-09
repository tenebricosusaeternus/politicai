import { useEffect, useRef, useState, Fragment } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import {
  ArrowLeft, Pencil, Check, Download, Loader2, Send, MapPin, Sparkles,
  GripVertical, Trash2, ChevronUp, ChevronDown,
  Heading, Type, Image as ImageIcon, BarChart3, MessageSquareQuote, Hash, Minus,
} from "lucide-react"
import { reportsApi } from "../api/reports"
import type { RelatorioDetail, Bloco, BlocoTipo } from "../api/reports"
import { BlocoView } from "../components/relatorio/Bloco"

const NIVEL_CONFIG = [
  { cor: "#10b981", glow: "rgba(16,185,129,0.4)", label: "Tranquilo" },
  { cor: "#4ade80", glow: "rgba(74,222,128,0.4)", label: "Normal" },
  { cor: "#facc15", glow: "rgba(250,204,21,0.4)", label: "Atenção" },
  { cor: "#f97316", glow: "rgba(249,115,22,0.4)", label: "Alerta" },
  { cor: "#ef4444", glow: "rgba(239,68,68,0.4)", label: "Crítico" },
]

function nid(): string {
  try { return crypto.randomUUID().slice(0, 10) } catch { return Math.random().toString(36).slice(2, 12) }
}

const TIPOS: { tipo: BlocoTipo; label: string; Icon: typeof Type }[] = [
  { tipo: "titulo", label: "Título", Icon: Heading },
  { tipo: "texto", label: "Texto", Icon: Type },
  { tipo: "imagem", label: "Imagem", Icon: ImageIcon },
  { tipo: "grafico", label: "Gráfico", Icon: BarChart3 },
  { tipo: "callout", label: "Destaque", Icon: MessageSquareQuote },
  { tipo: "metricas", label: "Métricas", Icon: Hash },
  { tipo: "divisoria", label: "Divisória", Icon: Minus },
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blocoVazio(tipo: BlocoTipo): any {
  switch (tipo) {
    case "titulo": return { texto: "", nivel: 2 }
    case "texto": return { texto: "" }
    case "imagem": return { url: "", legenda: "" }
    case "grafico": return { variante: "bar", titulo: "", categorias: ["A", "B", "C"], series: [{ nome: "Série", dados: [1, 2, 3] }] }
    case "callout": return { variante: "info", titulo: "", texto: "" }
    case "metricas": return { itens: [{ label: "Métrica", valor: "0" }] }
    case "divisoria": return {}
    default: return {}
  }
}

function MedidorAlerta({ nivel, editing, onChange }: { nivel: number; editing: boolean; onChange: (n: number) => void }) {
  const cfg = NIVEL_CONFIG[Math.min(Math.max(nivel - 1, 0), 4)]
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-end gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} disabled={!editing} onClick={() => editing && onChange(n)}
            className={`rounded-md transition-all ${editing ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
            style={{ width: 18, height: 18 + n * 8, background: n <= nivel ? cfg.cor : "rgba(255,255,255,0.08)", boxShadow: n <= nivel ? `0 0 12px ${cfg.glow}` : "none" }} />
        ))}
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-white leading-none">{nivel}<span className="text-base text-slate-500">/5</span></p>
        <p className="text-xs font-medium mt-0.5" style={{ color: cfg.cor }}>{cfg.label}</p>
      </div>
    </div>
  )
}

export function RelatorioDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const docRef = useRef<HTMLDivElement>(null)

  const [rel, setRel] = useState<RelatorioDetail | null>(null)
  const [blocos, setBlocos] = useState<Bloco[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [arrastando, setArrastando] = useState<{ tipo?: BlocoTipo; from?: number } | null>(null)
  const [overZona, setOverZona] = useState<number | null>(null)
  const [iaEm, setIaEm] = useState<string | null>(null)          // id do bloco com painel de IA aberto
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!id) return
    reportsApi.get(Number(id))
      .then((r) => { setRel(r); setBlocos(r.blocos || []) })
      .catch(() => navigate("/reports"))
      .finally(() => setLoading(false))
  }, [id])

  // Persiste o campo no backend (com debounce para edições de texto)
  function patch(campo: keyof RelatorioDetail, valor: unknown, debounce = false) {
    if (!rel) return
    setRel({ ...rel, [campo]: valor })
    const enviar = () => {
      setSalvando(true)
      reportsApi.atualizar(rel.id, { [campo]: valor }).catch(() => {}).finally(() => setSalvando(false))
    }
    if (debounce) {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(enviar, 700)
    } else enviar()
  }

  function salvarBlocos(novos: Bloco[], debounce = true) {
    setBlocos(novos)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const enviar = () => {
      if (!rel) return
      setSalvando(true)
      reportsApi.atualizar(rel.id, { blocos: novos }).catch(() => {}).finally(() => setSalvando(false))
    }
    if (debounce) saveTimer.current = setTimeout(enviar, 700)
    else enviar()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onChangeBloco = (i: number, dados: any) => {
    const arr = [...blocos]; arr[i] = { ...arr[i], dados }; salvarBlocos(arr, true)
  }
  const addBlocoAt = (tipo: BlocoTipo, pos: number) => {
    const arr = [...blocos]
    arr.splice(pos, 0, { id: nid(), tipo, dados: blocoVazio(tipo) })
    salvarBlocos(arr, false)
  }
  const removerBloco = (i: number) => salvarBlocos(blocos.filter((_, k) => k !== i), false)
  const moverBloco = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= blocos.length) return
    const arr = [...blocos];[arr[i], arr[j]] = [arr[j], arr[i]]; salvarBlocos(arr, false)
  }
  // Solta na posição `pos`: novo bloco (da paleta) ou move um existente
  const handleDrop = (pos: number) => {
    if (arrastando?.tipo) {
      addBlocoAt(arrastando.tipo, pos)
    } else if (arrastando?.from != null) {
      const from = arrastando.from
      const arr = [...blocos]
      const [mov] = arr.splice(from, 1)
      arr.splice(from < pos ? pos - 1 : pos, 0, mov)
      salvarBlocos(arr, false)
    }
    setArrastando(null); setOverZona(null)
  }

  const [iaInstrucao, setIaInstrucao] = useState("")
  const [iaLoading, setIaLoading] = useState(false)
  async function gerarIA(i: number) {
    if (!rel || !iaInstrucao.trim()) return
    setIaLoading(true)
    try {
      const { dados } = await reportsApi.gerarBloco(rel.id, blocos[i].tipo, iaInstrucao.trim())
      const arr = [...blocos]; arr[i] = { ...arr[i], dados: { ...arr[i].dados, ...dados } }
      salvarBlocos(arr, false)
      setIaEm(null); setIaInstrucao("")
    } catch {
      // silencioso
    } finally {
      setIaLoading(false)
    }
  }

  async function exportarPDF() {
    if (!docRef.current || !rel) return
    setExportando(true)
    const eraEdicao = editing
    setEditing(false)
    await new Promise((r) => setTimeout(r, 200))
    try {
      const canvas = await html2canvas(docRef.current, { backgroundColor: "#0a0f1e", scale: 2, useCORS: true, logging: false })
      const img = canvas.toDataURL("image/jpeg", 0.92)
      const pdf = new jsPDF("p", "mm", "a4")
      const w = pdf.internal.pageSize.getWidth()
      const h = pdf.internal.pageSize.getHeight()
      const imgH = (canvas.height * w) / canvas.width
      let restante = imgH, pos = 0
      pdf.addImage(img, "JPEG", 0, pos, w, imgH); restante -= h
      while (restante > 0) { pos -= h; pdf.addPage(); pdf.addImage(img, "JPEG", 0, pos, w, imgH); restante -= h }
      pdf.save(`Resumo-do-Dia-Belem-${rel.periodo_inicio}.pdf`)
    } catch {
      alert("Erro ao exportar PDF")
    } finally {
      if (eraEdicao) setEditing(true)
      setExportando(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-96"><Loader2 size={24} className="animate-spin text-brand-300" /></div>
  if (!rel) return null

  const periodoLabel = rel.periodo_inicio === rel.periodo_fim
    ? format(parseISO(rel.periodo_inicio), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : `${format(parseISO(rel.periodo_inicio), "dd/MM", { locale: ptBR })} a ${format(parseISO(rel.periodo_fim), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`

  // Zona de soltar entre blocos (recebe bloco novo da paleta ou reordenação)
  const DropZone = ({ pos }: { pos: number }) => {
    if (!editing) return null
    const ativo = overZona === pos
    const arrastandoAlgo = arrastando !== null
    return (
      <div
        onDragOver={(e) => { if (arrastandoAlgo) { e.preventDefault(); setOverZona(pos) } }}
        onDragLeave={() => setOverZona((z) => (z === pos ? null : z))}
        onDrop={() => handleDrop(pos)}
        className={`transition-all ${ativo ? "h-9 my-1 rounded-lg border-2 border-dashed border-brand-300 bg-brand-400/10" : arrastandoAlgo ? "h-3" : "h-1"}`}
      />
    )
  }

  // Paleta lateral de blocos
  const Palette = () => (
    <aside className="hidden lg:block w-44 shrink-0">
      <div className="sticky top-20 space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 px-1">Inserir bloco</p>
        <p className="text-[10px] text-slate-600 px-1 leading-snug">Arraste para o documento ou clique para adicionar ao fim.</p>
        <div className="space-y-1.5">
          {TIPOS.map(({ tipo, label, Icon }) => (
            <div
              key={tipo}
              draggable
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", tipo); setArrastando({ tipo }) }}
              onDragEnd={() => { setArrastando(null); setOverZona(null) }}
              onClick={() => addBlocoAt(tipo, blocos.length)}
              className="select-none flex items-center gap-2 bg-brand-800 border border-brand-600 hover:border-brand-400 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white cursor-grab active:cursor-grabbing transition-colors"
            >
              <Icon size={15} className="text-brand-300 pointer-events-none" /> <span className="pointer-events-none">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )

  return (
    <div className={`min-h-screen bg-brand-900 pb-16 ${arrastando ? "select-none" : ""}`}>
      {/* Toolbar */}
      <div className="sticky top-0 z-20 bg-brand-900/90 backdrop-blur border-b border-brand-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={() => navigate("/reports")} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={16} /> Relatórios
          </button>
          <div className="flex items-center gap-2">
            {salvando && <span className="text-xs text-slate-500 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> salvando</span>}
            <button onClick={() => { setEditing(!editing); setIaEm(null) }}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${editing ? "bg-emerald-500 hover:bg-emerald-400 text-white" : "bg-brand-700 hover:bg-brand-600 text-slate-200"}`}>
              {editing ? <><Check size={14} /> Concluir</> : <><Pencil size={14} /> Editar</>}
            </button>
            <button onClick={() => patch("status", rel.status === "publicado" ? "rascunho" : "publicado")}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${rel.status === "publicado" ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-brand-700 hover:bg-brand-600 text-slate-200"}`}>
              <Send size={14} /> {rel.status === "publicado" ? "Publicado" : "Publicar"}
            </button>
            <button onClick={exportarPDF} disabled={exportando}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-white transition-colors">
              {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
            </button>
          </div>
        </div>
      </div>

      {/* Documento + paleta lateral */}
      <div className="flex justify-center gap-5 px-4">
      <div ref={docRef} className="flex-1 max-w-4xl bg-brand-900 px-2 md:px-10 py-10">
        {/* Capa */}
        <header className="relative overflow-hidden rounded-3xl border border-brand-600 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 p-8 md:p-10 mb-8">
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-brand-400/20 rounded-full blur-3xl" />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-brand-300"><MapPin size={14} /><span className="text-xs font-semibold uppercase tracking-widest">Belém · Pará</span></div>
              {editing ? (
                <input value={rel.titulo} onChange={(e) => patch("titulo", e.target.value, true)}
                  className="w-full bg-brand-900/40 border border-brand-400/40 rounded-lg px-3 py-1.5 text-3xl md:text-4xl font-bold text-white outline-none" />
              ) : (
                <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight">{rel.titulo}</h1>
              )}
              <p className="text-sm text-slate-400 capitalize">{periodoLabel}</p>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1"><Sparkles size={11} className="text-brand-300" /> Gerado por IA · {rel.gerado_por_llm ?? "—"}</div>
            </div>
            <div className="shrink-0 flex flex-col items-center gap-3 bg-brand-900/40 rounded-2xl border border-brand-600/60 px-6 py-5">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Nível de Alerta</p>
              <MedidorAlerta nivel={rel.nivel_alerta} editing={editing} onChange={(n) => patch("nivel_alerta", n)} />
            </div>
          </div>
          <div className="relative mt-6 pt-5 border-t border-brand-600/60">
            {editing ? (
              <textarea value={rel.nivel_alerta_justificativa ?? ""} onChange={(e) => patch("nivel_alerta_justificativa", e.target.value, true)}
                placeholder="Justificativa do nível de alerta…" rows={2}
                className="w-full bg-brand-900/40 border border-brand-400/30 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none resize-none" />
            ) : (
              <p className="text-sm text-slate-300 leading-relaxed">{rel.nivel_alerta_justificativa}</p>
            )}
          </div>
        </header>

        {/* Blocos */}
        <DropZone pos={0} />
        {blocos.map((b, i) => (
          <Fragment key={b.id}>
          <div
            className={`group relative ${editing ? "rounded-lg hover:bg-brand-800/30 -mx-2 px-2 py-1" : ""} ${arrastando?.from === i ? "opacity-40" : ""}`}>

            {editing && (
              <div className="absolute -left-1 top-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <span draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); setArrastando({ from: i }) }}
                  onDragEnd={() => { setArrastando(null); setOverZona(null) }}
                  className="select-none cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-300" title="Arrastar para reordenar">
                  <GripVertical size={14} />
                </span>
              </div>
            )}

            <div className={editing ? "pl-4" : ""}>
              <BlocoView bloco={b} editing={editing} onChange={(dados) => onChangeBloco(i, dados)} />
            </div>

            {editing && (
              <div className="absolute right-0 top-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-brand-800/90 border border-brand-600 rounded-lg px-1 py-0.5">
                <button onClick={() => setIaEm(iaEm === b.id ? null : b.id)} title="Gerar com IA" className="p-1 rounded text-brand-300 hover:bg-brand-700"><Sparkles size={13} /></button>
                <button onClick={() => moverBloco(i, -1)} title="Subir" className="p-1 rounded text-slate-400 hover:bg-brand-700 hover:text-white"><ChevronUp size={13} /></button>
                <button onClick={() => moverBloco(i, 1)} title="Descer" className="p-1 rounded text-slate-400 hover:bg-brand-700 hover:text-white"><ChevronDown size={13} /></button>
                <button onClick={() => removerBloco(i)} title="Remover" className="p-1 rounded text-slate-400 hover:bg-brand-700 hover:text-red-400"><Trash2 size={13} /></button>
              </div>
            )}

            {/* Painel de geração por IA */}
            {editing && iaEm === b.id && (
              <div className="mt-2 ml-4 bg-brand-800 border border-brand-400/40 rounded-xl p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-brand-300"><Sparkles size={12} /> Gerar conteúdo deste bloco ({b.tipo}) com IA</div>
                <textarea value={iaEm === b.id ? iaInstrucao : ""} onChange={(e) => setIaInstrucao(e.target.value)}
                  placeholder="Ex: faça uma análise do sentimento sobre as obras de mobilidade nesta semana"
                  rows={2} className="w-full bg-brand-900/60 border border-brand-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none resize-none" />
                <div className="flex items-center gap-2">
                  <button onClick={() => gerarIA(i)} disabled={iaLoading || !iaInstrucao.trim()}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-400 hover:bg-brand-300 disabled:opacity-50 text-white">
                    {iaLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Gerar
                  </button>
                  <button onClick={() => { setIaEm(null); setIaInstrucao("") }} className="text-xs text-slate-500 hover:text-slate-300">cancelar</button>
                  <span className="text-[10px] text-slate-600">o conteúdo gerado substitui este bloco e você pode editar por cima</span>
                </div>
              </div>
            )}
          </div>
          <DropZone pos={i + 1} />
          </Fragment>
        ))}

        {blocos.length === 0 && editing && (
          <p className="text-center text-sm text-slate-600 py-8">Documento vazio — arraste um bloco da paleta à direita para começar.</p>
        )}

        {/* Rodapé */}
        <footer className="pt-8 mt-8 border-t border-brand-700 text-center">
          <p className="text-lg font-bold text-white tracking-tight">Politic<span className="text-brand-300">AI</span></p>
          <p className="text-xs text-slate-600 mt-1">Inteligência Política · Monitoramento de Mídia Digital · Belém / PA</p>
        </footer>
      </div>

      {editing && <Palette />}
      </div>
    </div>
  )
}
