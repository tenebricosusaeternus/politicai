import { useCallback, useEffect, useMemo, useState } from "react"
import { Navigate } from "react-router-dom"
import { Bot, BrainCircuit, CheckCircle2, Database, FileCode2, RefreshCw, ShieldAlert, XCircle } from "lucide-react"
import { Card } from "../components/ui/Card"
import { llmApi } from "../api/llm"
import type { ClassificationTestResult, GoldenMention, LlmInstance, LlmInstanceDetail, LlmRegistry } from "../api/llm"
import { useAuth } from "../store/auth"

function badgeClass(value: string): string {
  if (["critica", "alta", "reasoning", "report"].includes(value)) return "text-red-300 bg-red-500/10 border-red-500/30"
  if (["media", "json"].includes(value)) return "text-amber-300 bg-amber-500/10 border-amber-500/30"
  if (["fast", "compact_lines"].includes(value)) return "text-green-300 bg-green-500/10 border-green-500/30"
  return "text-slate-300 bg-slate-500/10 border-slate-500/30"
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brand-700/50 border border-brand-600 rounded-lg p-3">
      <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-white mt-1 break-words">{value}</p>
    </div>
  )
}

function InstanceRow({ item, selected, onClick }: { item: LlmInstance; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-lg p-4 transition-colors ${
        selected ? "border-brand-300 bg-brand-400/10" : "border-brand-600 bg-brand-700/40 hover:bg-brand-700"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{item.name}</p>
          <p className="text-xs text-slate-500 mt-1">{item.id}</p>
        </div>
        <span className={`text-xs border rounded-full px-2 py-1 ${badgeClass(item.model_alias)}`}>
          {item.model_alias}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <span className={`text-xs border rounded-full px-2 py-1 ${badgeClass(item.output_mode)}`}>{item.output_mode}</span>
        <span className={`text-xs border rounded-full px-2 py-1 ${item.thinking ? "text-violet-300 bg-violet-500/10 border-violet-500/30" : "text-slate-300 bg-slate-500/10 border-slate-500/30"}`}>
          {item.thinking ? "thinking" : "no thinking"}
        </span>
        <span className="text-xs text-slate-500 border border-brand-600 rounded-full px-2 py-1">
          temp {item.temperature}
        </span>
      </div>
    </button>
  )
}

export function LlmOps() {
  const { role } = useAuth()
  const [registry, setRegistry] = useState<LlmRegistry | null>(null)
  const [selectedId, setSelectedId] = useState("fast_classification")
  const [detail, setDetail] = useState<LlmInstanceDetail | null>(null)
  const [golden, setGolden] = useState<GoldenMention[]>([])
  const [test, setTest] = useState<ClassificationTestResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([llmApi.registry(), llmApi.golden(24)])
      .then(([r, g]) => {
        setRegistry(r)
        setGolden(g.items)
        if (!r.instances.some((i) => i.id === selectedId) && r.instances[0]) {
          setSelectedId(r.instances[0].id)
        }
      })
      .finally(() => setLoading(false))
  }, [selectedId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!selectedId) return
    llmApi.instance(selectedId).then(setDetail)
  }, [selectedId])

  const selected = useMemo(
    () => registry?.instances.find((i) => i.id === selectedId) ?? null,
    [registry, selectedId],
  )

  if (role !== "admin") return <Navigate to="/" replace />

  const runTest = () => {
    setTesting(true)
    setTest(null)
    llmApi.testClassification(true)
      .then(setTest)
      .finally(() => setTesting(false))
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1800px] mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">LLM</h1>
          <p className="text-sm text-slate-500 mt-1">Instâncias, prompts versionados, schemas e testes de qualidade</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runTest}
            disabled={testing}
            className="inline-flex items-center gap-2 bg-brand-400 hover:bg-brand-300 disabled:opacity-60 text-white text-sm font-semibold px-4 py-3 rounded-lg transition-colors"
          >
            <BrainCircuit size={16} />
            {testing ? "Testando" : "Testar golden"}
          </button>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 border border-brand-600 hover:bg-brand-700 text-slate-300 hover:text-white text-sm font-semibold px-4 py-3 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
      </div>

      {loading || !registry ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <Metric label="Instâncias" value={String(registry.instances.length)} />
            <Metric label="Prompts" value={String(registry.prompts.length)} />
            <Metric label="Schemas" value={String(registry.schemas.length)} />
            <Metric label="Golden dataset" value={`${registry.golden_dataset.count} itens`} />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
            <Card className="space-y-3">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-brand-300" />
                <h2 className="text-xl font-bold text-white">Instâncias</h2>
              </div>
              <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
                {registry.instances.map((item) => (
                  <InstanceRow
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onClick={() => setSelectedId(item.id)}
                  />
                ))}
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-white">{selected?.name}</h2>
                    <p className="text-sm text-slate-500 mt-1">{selected?.active_model}</p>
                  </div>
                  {selected && (
                    <span className={`text-xs border rounded-full px-2 py-1 ${badgeClass(selected.model_alias)}`}>
                      {selected.model_alias}
                    </span>
                  )}
                </div>

                {selected && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Metric label="Prompt" value={selected.prompt_version} />
                    <Metric label="Schema" value={selected.schema_version} />
                    <Metric label="Max tokens" value={String(selected.max_tokens)} />
                  </div>
                )}

                {selected && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="border border-brand-600 rounded-lg p-3">
                      <p className="text-slate-500 text-xs uppercase tracking-wider">Risco</p>
                      <p className="text-slate-300 mt-1">{selected.risk}</p>
                    </div>
                    <div className="border border-brand-600 rounded-lg p-3">
                      <p className="text-slate-500 text-xs uppercase tracking-wider">Fallback</p>
                      <p className="text-slate-300 mt-1">{selected.fallback}</p>
                    </div>
                    <div className="border border-brand-600 rounded-lg p-3">
                      <p className="text-slate-500 text-xs uppercase tracking-wider">Auditoria humana</p>
                      <p className="text-slate-300 mt-1">{selected.human_audit}</p>
                    </div>
                  </div>
                )}
              </Card>

              <section className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                <Card className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileCode2 size={18} className="text-cyan-300" />
                    <h2 className="text-xl font-bold text-white">Prompt</h2>
                  </div>
                  <pre className="text-xs text-slate-300 bg-brand-900/60 border border-brand-700 rounded-lg p-4 overflow-auto max-h-[520px] whitespace-pre-wrap">
                    {detail?.prompt ?? "Carregando..."}
                  </pre>
                </Card>

                <Card className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Database size={18} className="text-emerald-300" />
                    <h2 className="text-xl font-bold text-white">Schema</h2>
                  </div>
                  <pre className="text-xs text-slate-300 bg-brand-900/60 border border-brand-700 rounded-lg p-4 overflow-auto max-h-[520px] whitespace-pre-wrap">
                    {detail?.schema ? JSON.stringify(detail.schema, null, 2) : "Carregando..."}
                  </pre>
                </Card>
              </section>
            </div>
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="space-y-4">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-amber-300" />
                <h2 className="text-xl font-bold text-white">Golden Dataset</h2>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {golden.map((item) => (
                  <div key={item.id} className="border border-brand-600 rounded-lg p-3 bg-brand-700/40">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-300">{item.texto}</p>
                      <span className={`text-xs border rounded-full px-2 py-1 ${badgeClass(item.prioridade)}`}>
                        {item.prioridade}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      {item.id} · esperado {item.classe_esperada} · {item.motivo}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="space-y-4">
              <div className="flex items-center gap-2">
                {test?.ok ? <CheckCircle2 size={18} className="text-green-300" /> : <XCircle size={18} className="text-slate-400" />}
                <h2 className="text-xl font-bold text-white">Teste do Classificador</h2>
              </div>
              {!test ? (
                <p className="text-sm text-slate-500">Rode o teste golden para comparar o Qwen rápido com os exemplos esperados.</p>
              ) : test.ok ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Acurácia" value={test.accuracy === null || test.accuracy === undefined ? "N/A" : `${Math.round(test.accuracy * 100)}%`} />
                    <Metric label="Modelo" value={test.model ?? "-"} />
                  </div>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {test.results?.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 border-b border-brand-700 pb-2">
                        <div>
                          <p className="text-sm text-slate-300">{item.texto}</p>
                          <p className="text-xs text-slate-500 mt-1">{item.id} · esperado {item.classe_esperada} · previsto {item.classe_prevista}</p>
                        </div>
                        {item.ok ? <CheckCircle2 size={16} className="text-green-300 shrink-0" /> : <XCircle size={16} className="text-red-300 shrink-0" />}
                      </div>
                    ))}
                  </div>
                  <pre className="text-xs text-slate-400 bg-brand-900/60 border border-brand-700 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
                    {test.raw_output}
                  </pre>
                </>
              ) : (
                <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-4">
                  <p className="text-sm text-red-300">{test.error}</p>
                  <pre className="text-xs text-slate-400 mt-3 whitespace-pre-wrap">{test.raw_output}</pre>
                </div>
              )}
            </Card>
          </section>

          <Card className="space-y-4">
            <h2 className="text-xl font-bold text-white">Modelos Ativos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {Object.entries(registry.models).map(([key, value]) => (
                <div key={key} className="border border-brand-600 rounded-lg p-3 bg-brand-700/40">
                  <p className="text-xs text-slate-500 uppercase tracking-wider">{key}</p>
                  <p className="text-sm font-semibold text-white mt-1 break-words">{value}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
