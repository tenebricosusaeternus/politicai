import type { ReactNode } from "react"
import {
  TrendingUp, TrendingDown, Minus, Eye, Megaphone,
  Camera, Globe, PlaySquare, AtSign, Search, Hash, Video,
} from "lucide-react"
import type {
  TemaItem, DestaquesAlerta, PerformanceDigital, Recomendacao, ResumoItem,
} from "../../api/reports"
import { Editable } from "./Editable"

// ─── Cabeçalho de seção ────────────────────────────────────────────────────

export function SecaoTitulo({ numero, titulo, subtitulo }: { numero: string; titulo: string; subtitulo?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-brand-400 to-brand-300 text-white text-sm font-bold shadow-lg shadow-brand-400/30">
        {numero}
      </div>
      <div>
        <h2 className="text-lg font-bold text-white tracking-tight">{titulo}</h2>
        {subtitulo && <p className="text-xs text-slate-500">{subtitulo}</p>}
      </div>
    </div>
  )
}

// ─── Pílula de tendência ───────────────────────────────────────────────────

function TendenciaPill({ tendencia }: { tendencia: string }) {
  const t = (tendencia || "").toLowerCase()
  if (t.includes("cresc") || t.includes("alta")) {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full"><TrendingUp size={11} /> {tendencia}</span>
  }
  if (t.includes("queda") || t.includes("baixa")) {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full"><TrendingDown size={11} /> {tendencia}</span>
  }
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 bg-slate-500/10 px-2 py-0.5 rounded-full"><Minus size={11} /> {tendencia}</span>
}

function Metrica({ label, valor }: { label: string; valor: ReactNode }) {
  return (
    <div className="text-center px-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-base font-bold text-white mt-0.5">{valor}</p>
    </div>
  )
}

// ─── Tema principal (card grande) ──────────────────────────────────────────

export function TemaPrincipalCard({
  tema, editing, onChange,
}: { tema: TemaItem; editing: boolean; onChange: (t: TemaItem) => void }) {
  const set = (k: keyof TemaItem, v: string) => onChange({ ...tema, [k]: v })
  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-400/30 bg-gradient-to-br from-brand-700/80 to-brand-800 p-6">
      <div className="absolute top-0 right-0 w-40 h-40 bg-brand-400/10 rounded-full blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] uppercase tracking-widest font-bold text-brand-300 bg-brand-400/15 px-2 py-1 rounded">Tema Principal</span>
          <TendenciaPill tendencia={tema.tendencia} />
        </div>
        <h3 className="text-xl font-bold text-white leading-snug mb-2">
          <Editable value={tema.titulo} onSave={(v) => set("titulo", v)} editing={editing} className="w-full text-xl font-bold" />
        </h3>
        <div className="text-sm text-slate-300 leading-relaxed mb-4">
          <Editable value={tema.descricao} onSave={(v) => set("descricao", v)} editing={editing} multiline className="text-sm" />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-brand-600/60 pt-4">
          <Metrica label="Alcance" valor={<Editable value={tema.alcance} onSave={(v) => set("alcance", v)} editing={editing} className="text-base font-bold w-20 text-center" />} />
          <div className="w-px h-8 bg-brand-600/60" />
          <Metrica label="Interações" valor={<Editable value={tema.interacoes} onSave={(v) => set("interacoes", v)} editing={editing} className="text-base font-bold w-20 text-center" />} />
          <div className="w-px h-8 bg-brand-600/60" />
          <Metrica label="Polaridade" valor={<Editable value={tema.polaridade} onSave={(v) => set("polaridade", v)} editing={editing} className="text-base font-bold w-28 text-center" />} />
          <div className="ml-auto flex flex-wrap gap-1">
            {(tema.fontes || []).map((f, i) => (
              <span key={i} className="text-[10px] text-slate-400 bg-brand-900/60 px-2 py-1 rounded">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tema secundário ───────────────────────────────────────────────────────

export function TemaSecundarioCard({
  tema, editing, onChange,
}: { tema: TemaItem; editing: boolean; onChange: (t: TemaItem) => void }) {
  const set = (k: keyof TemaItem, v: string) => onChange({ ...tema, [k]: v })
  return (
    <div className="rounded-xl border border-brand-600 bg-brand-800/60 p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base font-semibold text-white leading-snug flex-1">
          <Editable value={tema.titulo} onSave={(v) => set("titulo", v)} editing={editing} className="w-full font-semibold" />
        </h4>
        <TendenciaPill tendencia={tema.tendencia} />
      </div>
      <div className="text-sm text-slate-400 leading-relaxed">
        <Editable value={tema.descricao} onSave={(v) => set("descricao", v)} editing={editing} multiline className="text-sm" />
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
        <span>Alcance <b className="text-slate-300">{tema.alcance}</b></span>
        <span>Interações <b className="text-slate-300">{tema.interacoes}</b></span>
        <span className="text-slate-400">{tema.polaridade}</span>
      </div>
    </div>
  )
}

// ─── Destaque / Alerta ─────────────────────────────────────────────────────

export function ItemCard({
  item, editing, onChange, tipo,
}: { item: DestaquesAlerta; editing: boolean; onChange: (i: DestaquesAlerta) => void; tipo: "destaque" | "alerta" }) {
  const set = (k: keyof DestaquesAlerta, v: string) => onChange({ ...item, [k]: v })
  const cor = tipo === "destaque"
    ? { borda: "border-emerald-500/30", icone: "text-emerald-400", bg: "bg-emerald-500/5", Icon: Megaphone }
    : { borda: "border-amber-500/30", icone: "text-amber-400", bg: "bg-amber-500/5", Icon: Eye }
  const { Icon } = cor
  return (
    <div className={`rounded-xl border ${cor.borda} ${cor.bg} p-5 space-y-3`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${cor.icone}`}><Icon size={18} /></div>
        <h4 className="text-base font-semibold text-white leading-snug flex-1">
          <Editable value={item.titulo} onSave={(v) => set("titulo", v)} editing={editing} className="w-full font-semibold" />
        </h4>
      </div>
      <div className="text-sm text-slate-400 leading-relaxed">
        <Editable value={item.descricao} onSave={(v) => set("descricao", v)} editing={editing} multiline className="text-sm" />
      </div>
      <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
        <span>Alcance <b className="text-slate-300">{item.alcance}</b></span>
        <span>Interações <b className="text-slate-300">{item.interacoes}</b></span>
        <div className="ml-auto flex gap-1">
          {(item.fontes || []).map((f, i) => (
            <span key={i} className="text-[10px] text-slate-400 bg-brand-900/60 px-2 py-0.5 rounded">{f}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Performance digital ───────────────────────────────────────────────────

const CANAL_ICON: Record<string, typeof Camera> = {
  instagram: Camera, facebook: Globe, youtube: PlaySquare,
  "x/twitter": AtSign, twitter: AtSign, tiktok: Video,
}

export function PerformanceCard({
  titulo, perf, editing, onChange,
}: { titulo: string; perf: PerformanceDigital; editing: boolean; onChange: (p: PerformanceDigital) => void }) {
  const set = (k: keyof PerformanceDigital, v: string) => onChange({ ...perf, [k]: v })
  const maxInteracoes = Math.max(
    ...(perf.canais || []).map((c) => parseInteracao(c.interacoes)), 1
  )
  return (
    <div className="rounded-xl border border-brand-600 bg-brand-800/60 p-5 space-y-4">
      <h4 className="text-sm font-bold text-white uppercase tracking-wider">{titulo}</h4>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-brand-900/50 rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Interações</p>
          <p className="text-lg font-bold text-white mt-1">
            <Editable value={perf.interacoes_total} onSave={(v) => set("interacoes_total", v)} editing={editing} className="text-lg font-bold w-full text-center" />
          </p>
        </div>
        <div className="bg-brand-900/50 rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Seguidores</p>
          <p className="text-lg font-bold text-white mt-1">
            <Editable value={perf.novos_seguidores} onSave={(v) => set("novos_seguidores", v)} editing={editing} className="text-lg font-bold w-full text-center" />
          </p>
        </div>
        <div className="bg-brand-900/50 rounded-lg p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Engaj.</p>
          <p className="text-lg font-bold text-white mt-1">
            <Editable value={perf.engajamento_taxa} onSave={(v) => set("engajamento_taxa", v)} editing={editing} className="text-lg font-bold w-full text-center" />
          </p>
        </div>
      </div>

      {(perf.canais || []).length > 0 && (
        <div className="space-y-2">
          {perf.canais.map((c, i) => {
            const Icon = CANAL_ICON[c.nome.toLowerCase()] ?? Hash
            const pct = (parseInteracao(c.interacoes) / maxInteracoes) * 100
            return (
              <div key={i} className="flex items-center gap-3">
                <Icon size={14} className="text-slate-400 shrink-0" />
                <span className="text-xs text-slate-300 w-20 shrink-0">{c.nome}</span>
                <div className="flex-1 h-2 bg-brand-900 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-brand-400 to-brand-300 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-slate-400 w-14 text-right shrink-0">{c.interacoes}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="text-sm text-slate-400 leading-relaxed border-t border-brand-600/60 pt-3">
        <Editable value={perf.analise} onSave={(v) => set("analise", v)} editing={editing} multiline className="text-sm" placeholder="Análise do desempenho..." />
      </div>
    </div>
  )
}

function parseInteracao(s: string): number {
  if (!s) return 0
  const n = parseFloat(s.replace(/[^\d.,]/g, "").replace(",", "."))
  if (isNaN(n)) return 0
  if (/m/i.test(s)) return n * 1_000_000
  if (/k/i.test(s)) return n * 1_000
  return n
}

// ─── Tendências ────────────────────────────────────────────────────────────

export function TendenciaCard({
  plataforma, valor, editing, onChange,
}: { plataforma: "google" | "twitter" | "youtube"; valor: string; editing: boolean; onChange: (v: string) => void }) {
  const cfg = {
    google: { Icon: Search, cor: "text-blue-400", label: "Google Trends" },
    twitter: { Icon: AtSign, cor: "text-sky-400", label: "X / Twitter" },
    youtube: { Icon: PlaySquare, cor: "text-red-400", label: "YouTube" },
  }[plataforma]
  const { Icon } = cfg
  return (
    <div className="rounded-xl border border-brand-600 bg-brand-800/60 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={16} className={cfg.cor} />
        <h4 className="text-sm font-semibold text-white">{cfg.label}</h4>
      </div>
      <div className="text-sm text-slate-400 leading-relaxed">
        <Editable value={valor} onSave={onChange} editing={editing} multiline placeholder="Tendências e termos em alta..." className="text-sm" />
      </div>
    </div>
  )
}

// ─── Recomendação ──────────────────────────────────────────────────────────

export function RecomendacaoCard({
  rec, editing, onChange,
}: { rec: Recomendacao; editing: boolean; onChange: (r: Recomendacao) => void }) {
  return (
    <div className="flex gap-4 rounded-xl border border-brand-600 bg-brand-800/60 p-5">
      <div className="flex items-center justify-center w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-300 text-white text-sm font-bold shadow-lg shadow-brand-400/20">
        {rec.numero}
      </div>
      <div className="flex-1 space-y-1.5">
        <h4 className="text-base font-semibold text-white leading-snug">
          <Editable value={rec.titulo} onSave={(v) => onChange({ ...rec, titulo: v })} editing={editing} className="w-full font-semibold" />
        </h4>
        <div className="text-sm text-slate-400 leading-relaxed">
          <Editable value={rec.descricao} onSave={(v) => onChange({ ...rec, descricao: v })} editing={editing} multiline className="text-sm" />
        </div>
      </div>
    </div>
  )
}

// ─── Resumo executivo ──────────────────────────────────────────────────────

export function ResumoCard({
  item, editing, onChange,
}: { item: ResumoItem; editing: boolean; onChange: (r: ResumoItem) => void }) {
  return (
    <div className="rounded-xl border-l-2 border-brand-400 bg-brand-800/40 pl-4 pr-5 py-4 space-y-1.5">
      <h4 className="text-sm font-bold text-brand-300">
        <Editable value={item.titulo} onSave={(v) => onChange({ ...item, titulo: v })} editing={editing} className="w-full font-bold text-brand-300" />
      </h4>
      <div className="text-sm text-slate-300 leading-relaxed">
        <Editable value={item.texto} onSave={(v) => onChange({ ...item, texto: v })} editing={editing} multiline className="text-sm" />
      </div>
    </div>
  )
}
