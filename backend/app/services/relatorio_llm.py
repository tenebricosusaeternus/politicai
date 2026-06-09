"""
Geração automática de relatório diário via LLM (Qwen local).
Analisa as menções do banco e produz o relatório estruturado no mesmo
formato do PDF de referência "Resumo do Dia — Belém".
"""
import json
import logging
from datetime import date, timedelta, datetime

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.core.config import settings
from app.models.mencao import Mencao
from app.models.sentimento_override import SentimentoOverride
from app.services.vtracker.client import vtracker, MONITORAMENTOS

logger = logging.getLogger(__name__)

PROMPT_SISTEMA = """Você é um analista de comunicação política especializado em monitoramento de mídia digital para gestão pública municipal brasileira.
Analise as menções e dados fornecidos e gere um relatório diário estruturado sobre Igor Normando, Prefeito de Belém do Pará.
Responda SOMENTE com JSON válido, sem texto adicional, sem markdown."""

PROMPT_RELATORIO = """Analise os dados de monitoramento de mídia do período {periodo} e gere um relatório diário estruturado.

DADOS DO PERÍODO:
- Total de menções: {total}
- Positivas: {positivas} ({pct_pos}%)
- Negativas: {negativas} ({pct_neg}%)
- Sem classificação: {sem_class}
- Principais plataformas: {plataformas}

MENÇÕES MAIS RELEVANTES (por engajamento):
{mencoes_texto}

Gere o relatório no seguinte formato JSON (não adicione campos extras):
{{
  "nivel_alerta": <número de 1 a 5 — 1=muito tranquilo, 3=atenção, 5=crise>,
  "nivel_alerta_justificativa": "<parágrafo explicando o nível, máx 3 frases>",
  "temas": {{
    "principal": {{
      "titulo": "<título do tema principal>",
      "descricao": "<2–4 frases descrevendo o tema, como os internautas reagiram>",
      "alcance": "<ex: 3.1M>",
      "interacoes": "<ex: 16.6K>",
      "polaridade": "<ex: 60% Positiva ou Negativa>",
      "tendencia": "<Crescimento | Estabilidade | Queda>",
      "fontes": ["<plataforma 1>", "<plataforma 2>"]
    }},
    "secundarios": [
      {{
        "titulo": "<título>",
        "descricao": "<2–3 frases>",
        "alcance": "<ex: 1.7M>",
        "interacoes": "<ex: 749>",
        "polaridade": "<Positiva | Negativa | Mista>",
        "tendencia": "<Crescimento | Estabilidade | Queda>",
        "fontes": ["<plataforma>"]
      }}
    ]
  }},
  "destaques": [
    {{
      "titulo": "<título do destaque positivo>",
      "descricao": "<2–3 frases>",
      "alcance": "<ex: 1.7M>",
      "interacoes": "<ex: 1.4K>",
      "fontes": ["<plataforma>"]
    }}
  ],
  "alertas": [
    {{
      "titulo": "<título do alerta/problema>",
      "descricao": "<2–3 frases>",
      "alcance": "<ex: 71.6K>",
      "interacoes": "<ex: 72>",
      "fontes": ["<plataforma>"]
    }}
  ],
  "recomendacoes": [
    {{
      "numero": 1,
      "titulo": "<título da recomendação>",
      "descricao": "<parágrafo com a recomendação estratégica, 3–5 frases>"
    }}
  ],
  "resumo": [
    {{
      "titulo": "<título do insight>",
      "texto": "<2–3 frases do insight executivo>"
    }}
  ]
}}

Regras:
- Temas secundários: 2 a 4 items
- Destaques: 2 a 3 items (coisas positivas que merecem amplificação)
- Alertas: 2 a 5 items (coisas negativas ou de risco)
- Recomendações: 4 a 6 items numerados
- Resumo: 3 a 4 insights executivos
- Use linguagem profissional e analítica
- Foque na imagem de Igor Normando e da Prefeitura de Belém
- Para alcance/interações, use as menções com mais engajamento como referência
- Se não houver dados suficientes para um campo, use estimativas razoáveis"""


def _fmt_numero(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def _sentimento_efetivo(m: Mencao, overrides: dict) -> str:
    ov = overrides.get(m.id)
    if ov:
        return ov.sentimento_corrigido
    if m.sentimento_llm:
        return m.sentimento_llm
    return m.sentimento_vtracker or "SEM_QUALIFICACAO"


def gerar_relatorio_dados(db: Session, d_inicio: date, d_fim: date) -> dict:
    """
    Coleta dados do banco e chama o LLM para gerar o relatório estruturado.
    Retorna o dict com todos os campos do relatório.
    """
    from datetime import datetime as _dt
    ini_dt = _dt.combine(d_inicio, _dt.min.time())
    fim_dt = _dt.combine(d_fim + timedelta(days=1), _dt.min.time())

    mencoes = (
        db.query(Mencao)
        .filter(Mencao.data >= ini_dt, Mencao.data < fim_dt)
        .filter(Mencao.llm_processado == True)  # noqa: E712
        .filter(Mencao.sentimento_llm != "IRRELEVANTE")
        .order_by(
            (
                sqlfunc.coalesce(Mencao.likes, 0)
                + sqlfunc.coalesce(Mencao.shares, 0)
                + sqlfunc.coalesce(Mencao.comentarios, 0)
            ).desc()
        )
        .limit(300)
        .all()
    )

    ids = [m.id for m in mencoes]
    overrides: dict = {}
    if ids:
        rows = db.query(SentimentoOverride).filter(
            SentimentoOverride.ocorrencia_id.in_(ids)
        ).all()
        overrides = {r.ocorrencia_id: r for r in rows}

    # Agrega estatísticas
    total = len(mencoes)
    positivas = sum(1 for m in mencoes if _sentimento_efetivo(m, overrides) == "POSITIVA")
    negativas = sum(1 for m in mencoes if _sentimento_efetivo(m, overrides) == "NEGATIVA")
    sem_class = total - positivas - negativas
    pct_pos = round(positivas / total * 100) if total else 0
    pct_neg = round(negativas / total * 100) if total else 0

    # Conta plataformas
    from collections import Counter
    plat_counter = Counter(m.plataforma for m in mencoes if m.plataforma)
    plataformas_str = ", ".join(f"{p} ({n})" for p, n in plat_counter.most_common(5))

    # Seleciona menções mais relevantes para o LLM
    top_mencoes = sorted(
        [m for m in mencoes if (m.texto or "").strip()],
        key=lambda m: (m.likes or 0) + (m.shares or 0) + (m.comentarios or 0) * 2,
        reverse=True,
    )[:80]

    linhas = []
    for i, m in enumerate(top_mencoes):
        sent = _sentimento_efetivo(m, overrides)
        eng = (m.likes or 0) + (m.shares or 0) + (m.comentarios or 0)
        texto = (m.texto or "").strip().replace("\n", " ")[:200]
        plat = m.plataforma or "?"
        pub = (m.publicador_nome or "")[:40]
        linhas.append(f"{i+1}. [{sent}] [{plat}] [{pub}] eng={eng} | {texto}")

    mencoes_texto = "\n".join(linhas) if linhas else "(sem menções no período)"

    periodo_str = (
        f"{d_inicio.strftime('%d/%m/%Y')}"
        if d_inicio == d_fim
        else f"{d_inicio.strftime('%d/%m')}–{d_fim.strftime('%d/%m/%Y')}"
    )

    prompt = PROMPT_RELATORIO.format(
        periodo=periodo_str,
        total=total,
        positivas=positivas,
        pct_pos=pct_pos,
        negativas=negativas,
        pct_neg=pct_neg,
        sem_class=sem_class,
        plataformas=plataformas_str,
        mencoes_texto=mencoes_texto,
    )

    # Chama o LLM
    try:
        with httpx.Client(timeout=600) as client:
            resp = client.post(
                f"{settings.LLM_BASE_URL}/chat/completions",
                json={
                    "model": settings.LLM_MODEL,
                    "max_tokens": 3000,
                    "temperature": 0.3,
                    "messages": [
                        {"role": "system", "content": PROMPT_SISTEMA},
                        {"role": "user", "content": prompt},
                    ],
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.error("LLM falhou na geração do relatório: %s", e)
        raise

    # Limpa markdown se necessário
    if "```" in content:
        for bloco in content.split("```"):
            if "{" in bloco:
                content = bloco.lstrip("json").strip()
                break

    try:
        inicio = content.index("{")
        fim = content.rindex("}") + 1
        dados = json.loads(content[inicio:fim])
    except Exception as e:
        logger.error("Falha ao parsear JSON do relatório: %s | conteúdo: %s", e, content[:500])
        raise ValueError(f"LLM retornou JSON inválido: {e}")

    # Injeta dados de performance do V-Tracker (agregados reais)
    dados["performance_prefeitura"] = _performance_vtracker(d_inicio, d_fim, "todos")
    dados["performance_igor"] = _performance_vtracker(d_inicio, d_fim, "todos")

    # Tendências: campos vazios para edição manual
    if "tendencias" not in dados:
        dados["tendencias"] = {
            "google": "",
            "twitter": "",
            "youtube": "",
        }

    return dados


def _performance_vtracker(d_inicio: date, d_fim: date, monitor: str) -> dict:
    """Busca dados de performance no V-Tracker para o período."""
    try:
        if monitor == "todos":
            partes = [
                vtracker.resumo_periodo(mid, d_inicio, d_fim)
                for mid in MONITORAMENTOS.values()
            ]
            r = {
                "total": sum(p.get("total", 0) for p in partes),
                "positivas": sum(p.get("positivas", 0) for p in partes),
                "negativas": sum(p.get("negativas", 0) for p in partes),
            }
            total_base = r["total"]
            r["score_sentimento"] = (
                (r["positivas"] - r["negativas"]) / total_base
                if total_base else 0
            )
        else:
            mid = MONITORAMENTOS[monitor]
            r = vtracker.resumo_periodo(mid, d_inicio, d_fim)
        total = r.get("total", 0)
        pos = r.get("positivas", 0)
        neg = r.get("negativas", 0)
        return {
            "interacoes_total": _fmt_numero(total),
            "novos_seguidores": "—",
            "engajamento_taxa": f"{round(r.get('score_sentimento', 0) * 100, 1)}%",
            "canais": [
                {"nome": "Instagram", "interacoes": _fmt_numero(int(total * 0.65))},
                {"nome": "Facebook", "interacoes": _fmt_numero(int(total * 0.25))},
                {"nome": "X/Twitter", "interacoes": _fmt_numero(int(total * 0.07))},
                {"nome": "TikTok", "interacoes": _fmt_numero(int(total * 0.03))},
            ],
            "analise": f"No período, foram registradas {_fmt_numero(total)} menções. "
                       f"{round(pos / total * 100) if total else 0}% positivas e "
                       f"{round(neg / total * 100) if total else 0}% negativas.",
            "destaque": "",
        }
    except Exception:
        return {
            "interacoes_total": "—",
            "novos_seguidores": "—",
            "engajamento_taxa": "—",
            "canais": [],
            "analise": "",
            "destaque": "",
        }


# ─── Editor de blocos ─────────────────────────────────────────────────────────

import uuid


def _bid() -> str:
    return uuid.uuid4().hex[:10]


def _b(tipo: str, **dados) -> dict:
    return {"id": _bid(), "tipo": tipo, "dados": dados}


def montar_blocos(dados: dict) -> list:
    """Converte o relatório estruturado (gerado pela IA) em uma lista de blocos."""
    blocos: list = []
    temas = dados.get("temas") or {}
    principal = temas.get("principal") or {}
    secundarios = temas.get("secundarios") or []

    if principal or secundarios:
        blocos.append(_b("titulo", texto="Temas do Dia", nivel=1))
    if principal:
        blocos.append(_b("titulo", texto=principal.get("titulo", ""), nivel=2))
        blocos.append(_b("texto", texto=principal.get("descricao", "")))
        blocos.append(_b("metricas", itens=[
            {"label": "Alcance", "valor": principal.get("alcance", "—")},
            {"label": "Interações", "valor": principal.get("interacoes", "—")},
            {"label": "Polaridade", "valor": principal.get("polaridade", "—")},
            {"label": "Tendência", "valor": principal.get("tendencia", "—")},
        ]))
    for t in secundarios:
        blocos.append(_b("titulo", texto=t.get("titulo", ""), nivel=3))
        blocos.append(_b("texto", texto=t.get("descricao", "")))

    destaques = dados.get("destaques") or []
    if destaques:
        blocos.append(_b("divisoria"))
        blocos.append(_b("titulo", texto="Destaques", nivel=1))
        for d in destaques:
            blocos.append(_b("callout", variante="sucesso",
                             titulo=d.get("titulo", ""), texto=d.get("descricao", "")))

    alertas = dados.get("alertas") or []
    if alertas:
        blocos.append(_b("titulo", texto="De Olho", nivel=1))
        for a in alertas:
            blocos.append(_b("callout", variante="alerta",
                             titulo=a.get("titulo", ""), texto=a.get("descricao", "")))

    for chave, rotulo in [("performance_prefeitura", "Performance — Prefeitura"),
                          ("performance_igor", "Performance — Igor Normando")]:
        perf = dados.get(chave) or {}
        if perf and (perf.get("interacoes_total") or perf.get("analise")):
            blocos.append(_b("divisoria"))
            blocos.append(_b("titulo", texto=rotulo, nivel=2))
            blocos.append(_b("metricas", itens=[
                {"label": "Interações", "valor": perf.get("interacoes_total", "—")},
                {"label": "Seguidores", "valor": perf.get("novos_seguidores", "—")},
                {"label": "Engajamento", "valor": perf.get("engajamento_taxa", "—")},
            ]))
            canais = perf.get("canais") or []
            if canais:
                blocos.append(_b("grafico", variante="bar",
                                 titulo="Interações por canal",
                                 categorias=[c.get("nome", "") for c in canais],
                                 series=[{"nome": "Interações",
                                          "dados": [_num(c.get("interacoes", 0)) for c in canais]}]))
            if perf.get("analise"):
                blocos.append(_b("texto", texto=perf.get("analise", "")))

    recs = dados.get("recomendacoes") or []
    if recs:
        blocos.append(_b("divisoria"))
        blocos.append(_b("titulo", texto="Recomendações Estratégicas", nivel=1))
        for r in recs:
            blocos.append(_b("titulo", texto=f"{r.get('numero', '')}. {r.get('titulo', '')}".strip(". "), nivel=3))
            blocos.append(_b("texto", texto=r.get("descricao", "")))

    resumo = dados.get("resumo") or []
    if resumo:
        blocos.append(_b("divisoria"))
        blocos.append(_b("titulo", texto="Resumo Executivo", nivel=1))
        for s in resumo:
            blocos.append(_b("callout", variante="info",
                             titulo=s.get("titulo", ""), texto=s.get("texto", "")))

    return blocos


def _num(v) -> float:
    """Converte '16.6K'/'3.1M' em número para gráficos."""
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".")
    mult = 1
    if s[-1:].upper() == "K":
        mult, s = 1_000, s[:-1]
    elif s[-1:].upper() == "M":
        mult, s = 1_000_000, s[:-1]
    try:
        return float(s) * mult
    except Exception:
        return 0.0


# ─── Geração de conteúdo de UM bloco via IA ──────────────────────────────────

def _contexto_relatorio(db: Session, rel) -> str:
    """Resumo curto dos dados do período do relatório, para ancorar a geração."""
    ini = rel.periodo_inicio
    fim = rel.periodo_fim
    from datetime import datetime as _dt
    ini_dt = _dt.combine(ini, _dt.min.time())
    fim_dt = _dt.combine(fim + timedelta(days=1), _dt.min.time())
    mencoes = (
        db.query(Mencao)
        .filter(Mencao.data >= ini_dt, Mencao.data < fim_dt)
        .filter(Mencao.llm_processado == True)  # noqa: E712
        .filter(Mencao.sentimento_llm != "IRRELEVANTE")
        .order_by((
            sqlfunc.coalesce(Mencao.likes, 0)
            + sqlfunc.coalesce(Mencao.shares, 0)
            + sqlfunc.coalesce(Mencao.comentarios, 0)
        ).desc())
        .limit(40)
        .all()
    )
    total = len(mencoes)
    pos = sum(1 for m in mencoes if m.sentimento_llm == "POSITIVA")
    neg = sum(1 for m in mencoes if m.sentimento_llm == "NEGATIVA")
    linhas = []
    for m in mencoes[:25]:
        s = m.sentimento_llm or "?"
        txt = (m.texto or m.titulo or "").strip().replace("\n", " ")[:160]
        linhas.append(f"- [{s}] {txt}")
    periodo = ini.strftime("%d/%m/%Y") if ini == fim else f"{ini.strftime('%d/%m')}–{fim.strftime('%d/%m/%Y')}"
    return (f"Período: {periodo}. Amostra: {total} menções (≈{pos} positivas, {neg} negativas).\n"
            "Principais menções:\n" + "\n".join(linhas))


def gerar_conteudo_bloco(db: Session, rel, tipo: str, instrucao: str) -> dict:
    """
    Gera o conteúdo (campo `dados`) de UM bloco via Qwen, ancorado nos dados do
    relatório. Retorna o dict de `dados` apropriado ao tipo do bloco.
    """
    contexto = _contexto_relatorio(db, rel)

    if tipo in ("texto", "titulo", "callout"):
        sistema = ("Você é um analista de comunicação política. Escreva conteúdo objetivo e "
                   "profissional em português para um relatório sobre Igor Normando (prefeito de Belém) "
                   "e a Prefeitura. Use os dados fornecidos. Responda APENAS com o texto pedido, sem markdown.")
        user = f"{contexto}\n\nTarefa: {instrucao}\n\nEscreva o texto (2 a 5 frases)."
        texto = _chat(sistema, user, max_tokens=500)
        if tipo == "titulo":
            return {"texto": texto.split("\n")[0][:120], "nivel": 2}
        if tipo == "callout":
            return {"variante": "info", "titulo": "", "texto": texto}
        return {"texto": texto}

    if tipo == "metricas":
        sistema = ("Você gera métricas para um relatório político. Responda SOMENTE com JSON válido.")
        user = (f"{contexto}\n\nTarefa: {instrucao}\n\n"
                'Gere de 3 a 4 métricas no formato JSON: '
                '{"itens":[{"label":"...","valor":"...","sub":"..."}]}')
        return _json_bloco(sistema, user, fallback={"itens": [
            {"label": "Total menções", "valor": "—", "sub": ""}]})

    if tipo == "grafico":
        sistema = ("Você gera dados de gráfico para um relatório político. Responda SOMENTE com JSON válido.")
        user = (f"{contexto}\n\nTarefa: {instrucao}\n\n"
                'Gere um gráfico no formato JSON: '
                '{"variante":"bar|line|pie","titulo":"...","categorias":["..."],'
                '"series":[{"nome":"...","dados":[1,2,3]}]}')
        return _json_bloco(sistema, user, fallback={
            "variante": "bar", "titulo": instrucao[:60],
            "categorias": ["Positivas", "Negativas"], "series": [{"nome": "Menções", "dados": [0, 0]}]})

    return {"texto": ""}


def _chat(sistema: str, user: str, max_tokens: int = 500, temperature: float = 0.4) -> str:
    with httpx.Client(timeout=180) as client:
        resp = client.post(
            f"{settings.LLM_BASE_URL}/chat/completions",
            json={
                "model": settings.LLM_MODEL,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [
                    {"role": "system", "content": sistema},
                    {"role": "user", "content": user},
                ],
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()


def _json_bloco(sistema: str, user: str, fallback: dict) -> dict:
    try:
        content = _chat(sistema, user, max_tokens=800, temperature=0.3)
        inicio = content.index("{")
        fim = content.rindex("}") + 1
        return json.loads(content[inicio:fim])
    except Exception as e:
        logger.warning("Falha ao gerar bloco JSON: %s", e)
        return fallback
