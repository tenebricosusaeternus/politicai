"""
Geração automática de relatório diário via LLM (Qwen local).
Analisa as menções do banco e produz o relatório estruturado no mesmo
formato do PDF de referência "Resumo do Dia — Belém".
"""
import json
import logging
from collections import Counter
from datetime import date, timedelta, datetime

from sqlalchemy.orm import Session
from app.models.mencao import Mencao
from app.models.sentimento_override import SentimentoOverride
from app.services.ai.llm_router import LLMTask, chat_completion
from app.services.curation import GENERIC_PUBLIC_SAFETY_TERMS, has_any, is_municipal_political_candidate, normalize_for_curation
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
- Não invente alcance, interações, percentuais ou tendência. Se não houver dado suficiente, use "—" ou "Indisponível".
- Não use menções fora do escopo municipal de Belém/Prefeitura/Igor.
- Não transforme tema genérico em crise. Aponte alertas apenas quando houver evidência nas menções fornecidas."""


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


def _dedup_por_link(mencoes: list[Mencao]) -> list[Mencao]:
    seen: set[str] = set()
    result: list[Mencao] = []
    for m in mencoes:
        key = (m.link or "").strip()
        if not key:
            key = f"{m.plataforma}|{m.publicador_nome}|{(m.data.date() if m.data else '')}|{(m.texto or '')[:80]}"
        if key in seen:
            continue
        seen.add(key)
        result.append(m)
    return result


GENERIC_REPORT_NOISE = {
    "copa do mundo", "copa", "feira", "show", "festival", "arraial",
    "pavulagem", "quadrilha", "quadrilhas", "exposição", "exposicao",
    "livro", "gastronomia", "gastronômico", "gastronomico", "turismo",
    "museu de grafite", "galeria a céu aberto",
}

REPORT_ACCOUNTABILITY_TERMS = {
    "prefeitura", "igor normando", "prefeito", "secretaria municipal",
    "sesma", "semec", "sezel", "seinfra", "segbel", "semma", "secult",
    "mppa", "mpf", "tcm", "cobrança", "cobranca", "cobram", "denúncia",
    "denuncia", "irregularidade", "falta", "abandono", "protesto",
    "manifestação", "manifestacao", "obra", "alagamento", "lixo", "buraco",
    "nomeação", "nomeacao", "contrato", "licitação", "licitacao",
}

REPORT_PUBLIC_SAFETY_CRISIS_TERMS = {
    "cobram", "cobra", "cobrança", "cobranca", "criticam", "crítica",
    "critica", "denunciam", "denúncia", "denuncia", "falha", "abandono",
    "insegurança", "inseguranca", "protesto", "manifestação", "manifestacao",
}


def _primary_report_text(m: Mencao) -> str:
    return f"{m.titulo or ''} {(m.texto or '')[:700]}".strip()


def _is_report_candidate(m: Mencao, overrides: dict) -> bool:
    if _sentimento_efetivo(m, overrides) == "IRRELEVANTE":
        return False
    if not is_municipal_political_candidate(m):
        return False
    texto = normalize_for_curation(_primary_report_text(m))
    if not has_any(texto, REPORT_ACCOUNTABILITY_TERMS):
        return False
    if has_any(texto, {"deputado estadual igor", "emenda do deputado estadual igor"}) and not has_any(texto, {"prefeitura", "prefeito", "gestão", "gestao"}):
        return False
    if has_any(texto, GENERIC_PUBLIC_SAFETY_TERMS) and not has_any(texto, REPORT_PUBLIC_SAFETY_CRISIS_TERMS):
        return False
    if has_any(texto, GENERIC_REPORT_NOISE) and not has_any(texto, REPORT_ACCOUNTABILITY_TERMS):
        return False
    return True


def gerar_relatorio_dados(db: Session, d_inicio: date, d_fim: date) -> dict:
    """
    Coleta dados do banco e chama o LLM para gerar o relatório estruturado.
    Retorna o dict com todos os campos do relatório.
    """
    from datetime import datetime as _dt
    ini_dt = _dt.combine(d_inicio, _dt.min.time())
    fim_dt = _dt.combine(d_fim + timedelta(days=1), _dt.min.time())

    mencoes_periodo = (
        db.query(Mencao)
        .filter(Mencao.data >= ini_dt, Mencao.data < fim_dt)
        .filter(Mencao.llm_processado == True)  # noqa: E712
        .order_by(Mencao.data.desc())
        .all()
    )

    mencoes_periodo = _dedup_por_link(mencoes_periodo)
    ids = [m.id for m in mencoes_periodo]
    overrides: dict = {}
    if ids:
        rows = db.query(SentimentoOverride).filter(
            SentimentoOverride.ocorrencia_id.in_(ids)
        ).all()
        overrides = {r.ocorrencia_id: r for r in rows}

    mencoes = [
        m for m in mencoes_periodo
        if _is_report_candidate(m, overrides)
    ]
    mencoes = sorted(
        mencoes,
        key=lambda m: (m.likes or 0) + (m.shares or 0) + (m.comentarios or 0),
        reverse=True,
    )[:300]

    # Agrega estatísticas
    total = len(mencoes)
    positivas = sum(1 for m in mencoes if _sentimento_efetivo(m, overrides) == "POSITIVA")
    negativas = sum(1 for m in mencoes if _sentimento_efetivo(m, overrides) == "NEGATIVA")
    neutras = sum(1 for m in mencoes if _sentimento_efetivo(m, overrides) == "NEUTRA")
    sem_class = max(0, total - positivas - negativas - neutras)
    pct_pos = round(positivas / total * 100) if total else 0
    pct_neg = round(negativas / total * 100) if total else 0
    engajamento_total = sum((m.likes or 0) + (m.shares or 0) + (m.comentarios or 0) for m in mencoes)
    publicadores = len({m.publicador_nome for m in mencoes if m.publicador_nome})
    score = round(((positivas - negativas) / total) * 100, 1) if total else 0

    # Conta plataformas
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

    # Chama o LLM. IMPORTANTE: JSON estruturado GRANDE roda no modelo instruct
    # ("default", Qwen2.5 não-reasoning): o modelo REPORT (Qwen3.x) ignora o
    # /no_think, esgota o orçamento "pensando" e devolve reasoning sem content
    # (falha documentada; mesma correção da Embratur).
    try:
        content = chat_completion(
            task="default",
            max_tokens=8000,
            temperature=0.1,
            thinking=False,
            timeout=600,
            messages=[
                {"role": "system", "content": PROMPT_SISTEMA},
                {"role": "user", "content": prompt},
            ],
        )
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

    dados["visao_geral"] = {
        "total_mencoes": total,
        "positivas": positivas,
        "negativas": negativas,
        "neutras": neutras,
        "sem_classificacao": sem_class,
        "score_sentimento": score,
        "engajamento_total": engajamento_total,
        "publicadores": publicadores,
        "plataformas": [{"nome": k, "total": v} for k, v in plat_counter.most_common(6)],
    }

    # Dados reais dos canais oficiais já persistidos pelo dashboard.
    dados["canais_oficiais"] = _canais_oficiais_db(db, d_inicio, d_fim)

    # Mantém os campos legados para telas/relatórios antigos.
    dados["performance_prefeitura"] = _performance_vtracker(d_inicio, d_fim, "todos")
    dados["performance_igor"] = _performance_from_official(dados["canais_oficiais"])

    # Tendências: campos vazios para edição manual
    if "tendencias" not in dados:
        dados["tendencias"] = {
            "google": "",
            "twitter": "",
            "youtube": "",
        }

    return dados


def _canais_oficiais_db(db: Session, d_inicio: date, d_fim: date) -> dict:
    try:
        from app.services.official_insights import get_official_insights_local
        dados = get_official_insights_local(db, d_inicio, d_fim)
        if dados.get("contas") or dados.get("top_posts"):
            return {
                "contas": dados.get("contas") or [],
                "top_posts": (dados.get("top_posts") or [])[:6],
            }

        # O dashboard normalmente sincroniza Insights em janelas de 7 dias.
        # Relatórios de 1-2 dias devem reaproveitar o snapshot oficial mais
        # recente que cubra ou encoste no período, em vez de omitir a seção.
        from app.models.official_insight import OfficialInsightSnapshot
        snap = (
            db.query(OfficialInsightSnapshot)
            .filter(OfficialInsightSnapshot.periodo_inicio <= d_inicio)
            .filter(OfficialInsightSnapshot.periodo_fim >= d_fim)
            .order_by(OfficialInsightSnapshot.periodo_fim.desc())
            .first()
        )
        if not snap:
            snap = (
                db.query(OfficialInsightSnapshot)
                .filter(OfficialInsightSnapshot.periodo_fim <= d_fim)
                .order_by(OfficialInsightSnapshot.periodo_fim.desc())
                .first()
            )
        if snap:
            dados = get_official_insights_local(db, snap.periodo_inicio, snap.periodo_fim)
            return {
                "contas": dados.get("contas") or [],
                "top_posts": (dados.get("top_posts") or [])[:6],
            }
        return {"contas": [], "top_posts": []}
    except Exception as e:
        logger.warning("Falha ao carregar canais oficiais no relatório: %s", e)
        return {"contas": [], "top_posts": []}


def _performance_from_official(oficiais: dict) -> dict:
    contas = oficiais.get("contas") or []
    eng = sum((c.get("postagens") or {}).get("engajamento_total", 0) for c in contas)
    seguidores = sum((c.get("perfil") or {}).get("seguidores", 0) for c in contas)
    posts = sum((c.get("postagens") or {}).get("total_posts", 0) for c in contas)
    canais = [
        {"nome": c.get("rede", ""), "interacoes": _fmt_numero((c.get("postagens") or {}).get("engajamento_total", 0))}
        for c in contas
    ]
    return {
        "interacoes_total": _fmt_numero(eng),
        "novos_seguidores": _fmt_numero(seguidores),
        "engajamento_taxa": f"{posts} posts",
        "canais": canais,
        "analise": "Performance consolidada dos canais oficiais no período, separando Facebook e Instagram.",
        "destaque": "",
    }


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


def _analise_politica_periodo(dados: dict) -> str:
    visao = dados.get("visao_geral") or {}
    temas = dados.get("temas") or {}
    principal = temas.get("principal") or {}
    secundarios = temas.get("secundarios") or []
    alertas = dados.get("alertas") or []
    destaques = dados.get("destaques") or []

    total = int(visao.get("total_mencoes") or 0)
    positivas = int(visao.get("positivas") or 0)
    negativas = int(visao.get("negativas") or 0)
    score = float(visao.get("score_sentimento") or 0)
    tema_principal = principal.get("titulo") or "sem tema dominante"

    if total < 20:
        abertura = (
            f"O período tem base política curada pequena, com {_fmt_numero(total)} menções úteis. "
            "A leitura deve ser tratada como sinal exploratório, não como diagnóstico fechado. "
            "Nessa condição, a prioridade é observar repetição, origem das publicações e capacidade de um assunto sair do caso isolado para uma narrativa pública."
        )
    elif score <= -20:
        abertura = (
            f"O ambiente digital do período é desfavorável: há {_fmt_numero(negativas)} menções negativas contra "
            f"{_fmt_numero(positivas)} positivas entre as menções curadas. "
            "A gestão deve evitar comunicação excessivamente comemorativa e priorizar resposta operacional, evidência de providência e prestação de contas."
        )
    elif score >= 20:
        abertura = (
            f"O ambiente digital é favorável, com saldo positivo de sentimento e {_fmt_numero(total)} menções úteis. "
            "Esse capital de percepção precisa ser convertido em narrativa de entrega concreta, com território, serviço público e benefício verificável."
        )
    else:
        abertura = (
            f"O ambiente político está competitivo, sem dominância clara. Há {_fmt_numero(positivas)} menções positivas "
            f"e {_fmt_numero(negativas)} negativas convivendo sem que uma narrativa única organize todo o debate. "
            "Esse é um cenário de disputa: pequenos problemas locais podem crescer rápido, mas entregas bem documentadas também têm espaço para equilibrar a agenda."
        )

    leitura_tema = (
        f"A narrativa mais visível no período é {tema_principal}. "
        f"{principal.get('descricao') or 'O tema aparece como eixo de atenção, mas precisa ser lido junto das evidências e publicadores que deram tração ao assunto.'}"
    )

    if secundarios:
        nomes = ", ".join(t.get("titulo", "") for t in secundarios[:3] if t.get("titulo"))
        leitura_tema += (
            f" Como pano de fundo, aparecem {nomes}. Esses assuntos devem ser separados por natureza: "
            "o que é prestação de serviço, o que é disputa de narrativa e o que pode virar risco reputacional."
        )

    if alertas:
        riscos = "; ".join(a.get("titulo", "") for a in alertas[:3] if a.get("titulo"))
        leitura_risco = (
            f"Os pontos que merecem acompanhamento são {riscos}. "
            "A régua correta é política e operacional: se houver bairro, serviço público, órgão responsável ou ator com capacidade de amplificação, o tema deve sair da observação passiva e entrar em rotina de checagem."
        )
    else:
        leitura_risco = (
            "Não há alerta robusto suficiente para caracterizar crise instalada. Ainda assim, a ausência de crise não dispensa curadoria: o risco municipal costuma nascer em reclamações pequenas, repetidas e territorializadas."
        )

    if destaques:
        positivos_lista = [d.get("titulo", "") for d in destaques[:2] if d.get("titulo")]
        positivos = "; ".join(positivos_lista)
        if len(positivos_lista) == 1:
            fechamento = (
                f"Do lado favorável, {positivos} pode sustentar uma agenda positiva se for apresentado com prova, localidade e consequência prática para o cidadão. "
                "O relatório deve evitar transformar todo dado positivo em propaganda; o valor está em conectar entrega, serviço e percepção pública."
            )
        else:
            fechamento = (
                f"Do lado favorável, {positivos} podem sustentar uma agenda positiva se forem apresentados com prova, localidade e consequência prática para o cidadão. "
                "O relatório deve evitar transformar todo dado positivo em propaganda; o valor está em conectar entrega, serviço e percepção pública."
            )
    else:
        fechamento = (
            "A agenda positiva ainda precisa de evidências mais fortes para ganhar tração. O caminho é selecionar entregas com prova visual, dado verificável e relação direta com as cobranças do período."
        )

    return "\n\n".join([abertura, leitura_tema, leitura_risco, fechamento])


def montar_blocos(dados: dict) -> list:
    """Converte o relatório estruturado (gerado pela IA) em uma lista de blocos."""
    blocos: list = []
    visao = dados.get("visao_geral") or {}
    oficiais = dados.get("canais_oficiais") or {}
    temas = dados.get("temas") or {}
    principal = temas.get("principal") or {}
    secundarios = temas.get("secundarios") or []

    blocos.append(_b("hero_resumo",
                     titulo="Resumo do Dia — Belém",
                     subtitulo="Monitoramento político e performance digital",
                     nivel_alerta=dados.get("nivel_alerta", 3),
                     justificativa=dados.get("nivel_alerta_justificativa", ""),
                     kpis=[
                         {"label": "Menções úteis", "valor": _fmt_numero(visao.get("total_mencoes", 0)), "sub": "após higiene LLM"},
                         {"label": "Score", "valor": f"{float(visao.get('score_sentimento') or 0):+g}%", "sub": "positivo - negativo"},
                         {"label": "Engajamento", "valor": _fmt_numero(visao.get("engajamento_total", 0)), "sub": "likes, comentários e shares"},
                         {"label": "Publicadores", "valor": _fmt_numero(visao.get("publicadores", 0)), "sub": "vozes únicas"},
                     ]))

    blocos.append(_b("sentimento_painel",
                     titulo="Distribuição de Sentimento",
                     total=visao.get("total_mencoes", 0),
                     positivas=visao.get("positivas", 0),
                     negativas=visao.get("negativas", 0),
                     neutras=visao.get("neutras", 0),
                     score=visao.get("score_sentimento", 0),
                     plataformas=visao.get("plataformas", [])))

    blocos.append(_b("titulo", texto="Leitura Política do Período", nivel=1))
    blocos.append(_b("texto", texto=_analise_politica_periodo(dados)))

    if oficiais.get("contas"):
        blocos.append(_b("performance_oficial",
                         titulo="Performance dos Canais Oficiais",
                         contas=oficiais.get("contas", [])))

    if oficiais.get("top_posts"):
        blocos.append(_b("top_posts",
                         titulo="Top Posts Oficiais",
                         posts=oficiais.get("top_posts", [])[:6]))

    if principal or secundarios:
        blocos.append(_b("temas_principais",
                         titulo="Principais Temas",
                         principal=principal,
                         secundarios=secundarios[:4]))
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
    mencoes_periodo = (
        db.query(Mencao)
        .filter(Mencao.data >= ini_dt, Mencao.data < fim_dt)
        .filter(Mencao.llm_processado == True)  # noqa: E712
        .order_by(Mencao.data.desc())
        .all()
    )
    mencoes_periodo = _dedup_por_link(mencoes_periodo)
    ids = [m.id for m in mencoes_periodo]
    overrides = {}
    if ids:
        rows = db.query(SentimentoOverride).filter(SentimentoOverride.ocorrencia_id.in_(ids)).all()
        overrides = {r.ocorrencia_id: r for r in rows}
    mencoes = [
        m for m in mencoes_periodo
        if _is_report_candidate(m, overrides)
    ]
    mencoes = sorted(
        mencoes,
        key=lambda m: (m.likes or 0) + (m.shares or 0) + (m.comentarios or 0),
        reverse=True,
    )[:40]
    total = len(mencoes)
    pos = sum(1 for m in mencoes if _sentimento_efetivo(m, overrides) == "POSITIVA")
    neg = sum(1 for m in mencoes if _sentimento_efetivo(m, overrides) == "NEGATIVA")
    linhas = []
    for m in mencoes[:25]:
        s = _sentimento_efetivo(m, overrides)
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
        sistema = ("Você gera métricas para um relatório político. Responda SOMENTE com JSON válido. "
                   "Não invente números; use apenas dados do contexto ou retorne '—'.")
        user = (f"{contexto}\n\nTarefa: {instrucao}\n\n"
                'Gere de 3 a 4 métricas no formato JSON: '
                '{"itens":[{"label":"...","valor":"...","sub":"..."}]}')
        return _json_bloco(sistema, user, fallback={"itens": [
            {"label": "Total menções", "valor": "—", "sub": ""}]})

    if tipo == "grafico":
        sistema = ("Você gera dados de gráfico para um relatório político. Responda SOMENTE com JSON válido. "
                   "Não invente números; use apenas dados do contexto.")
        user = (f"{contexto}\n\nTarefa: {instrucao}\n\n"
                'Gere um gráfico no formato JSON: '
                '{"variante":"bar|line|pie","titulo":"...","categorias":["..."],'
                '"series":[{"nome":"...","dados":[1,2,3]}]}')
        return _json_bloco(sistema, user, fallback={
            "variante": "bar", "titulo": instrucao[:60],
            "categorias": ["Positivas", "Negativas"], "series": [{"nome": "Menções", "dados": [0, 0]}]})

    return {"texto": ""}


def _chat(
    sistema: str,
    user: str,
    max_tokens: int = 500,
    temperature: float = 0.4,
    thinking: bool = False,
) -> str:
    return chat_completion(
        task=LLMTask.REPORT,
        max_tokens=max_tokens,
        temperature=temperature,
        thinking=thinking,
        timeout=180,
        messages=[
            {"role": "system", "content": sistema},
            {"role": "user", "content": user},
        ],
    )


def _json_bloco(sistema: str, user: str, fallback: dict) -> dict:
    try:
        content = _chat(sistema, user, max_tokens=800, temperature=0.3)
        inicio = content.index("{")
        fim = content.rindex("}") + 1
        return json.loads(content[inicio:fim])
    except Exception as e:
        logger.warning("Falha ao gerar bloco JSON: %s", e)
        return fallback
