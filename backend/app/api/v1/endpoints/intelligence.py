import re
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, get_db
from app.models.mencao import Mencao
from app.models.official_insight import OfficialPost
from app.models.sentimento_override import SentimentoOverride
from app.models.user import User
from app.services.curation import (
    AMBIGUOUS_LOCAL_GEOGRAPHY,
    GENERIC_PUBLIC_SAFETY_TERMS,
    has_any,
    has_municipal_anchor,
    is_municipal_political_candidate,
    normalize_for_curation,
)
from app.services.monitoring_taxonomy import AGENCIES, LOCAL_GEOGRAPHY, PROGRAMS_AND_DELIVERIES, RISK_TERMS
from app.services.vtracker.client import MONITORAMENTOS

router = APIRouter(prefix="/intelligence", tags=["intelligence"])
_OVERVIEW_CACHE: dict[tuple, tuple[float, dict]] = {}
_OVERVIEW_CACHE_TTL_SECONDS = 180

STOPWORDS = {
    "para", "pela", "pelo", "pelos", "pelas", "como", "mais", "menos", "muito",
    "essa", "esse", "esta", "este", "isso", "isto", "sobre", "entre", "quando",
    "onde", "tambem", "também", "ainda", "porque", "prefeitura", "belem", "belém",
    "igor", "normando", "http", "https", "www", "com", "uma", "uns", "das", "dos",
    "nas", "nos", "não", "sim", "que", "por", "com", "sem", "ter", "ser", "foi",
    "são", "está", "estao", "estão", "pra", "pro", "tem", "seu", "sua", "seus",
    "suas", "deu", "vai", "vão", "dia", "hoje", "ontem", "todo", "todos", "toda",
    "todas", "povo", "pessoas", "cidade", "capital", "níveis", "niveis",
    "pará", "para", "paraense", "brasil", "mundo", "junho", "você", "voce",
    "anos", "feira", "programação", "programacao",
    "municipal", "após", "apos", "homem", "suspeito", "agentes", "durante",
    "dias", "meio", "ação", "acao",
    "cultura", "amazonas", "amazônia", "amazonia", "forró", "forro",
    "gastronomia", "gastronômico", "gastronomico", "experiência", "experiencia",
    "sabores", "trajetória", "trajetoria", "diário", "diario", "todo",
}

NARRATIVAS = {
    "Saúde": {"saude", "saúde", "upa", "hospital", "medico", "médico", "remedio", "remédio", "posto"},
    "Transporte": {"onibus", "ônibus", "transporte", "transito", "trânsito", "bRT".lower(), "tarifa", "mobilidade"},
    "Limpeza Urbana": {"lixo", "limpeza", "entulho", "saneamento", "alagamento", "canal", "drenagem"},
    "Segurança": {"segurança", "seguranca", "crime", "assalto", "violencia", "violência", "guarda"},
    "Educação": {"educacao", "educação", "escola", "creche", "professor", "aluno", "merenda"},
    "Obras": {"obra", "obras", "asfalto", "rua", "ponte", "reforma", "construção", "construcao"},
    "Gestão": {"gestao", "gestão", "prefeito", "governo", "secretaria", "serviço", "servico"},
}

GENERIC_CULTURE_TOURISM_TERMS = {
    "gastronomia", "gastronômico", "gastronomico", "copa do mundo", "copa",
    "música", "musica", "show", "festival", "arraial", "pavulagem",
    "quadrilha", "quadrilhas", "exposição", "exposicao", "livro",
    "futebol", "turismo", "destino turístico", "destino turistico",
}

ACCOUNTABILITY_TERMS = {
    "prefeitura", "igor normando", "prefeito", "secretaria municipal", "sesma",
    "semec", "sezel", "seinfra", "segbel", "semma", "secult", "mppa", "mpf",
    "tcm", "cobrança", "cobranca", "cobram", "denúncia", "denuncia",
    "irregularidade", "falta", "abandono", "protesto", "manifestação",
    "manifestacao", "obra", "alagamento", "lixo", "buraco",
}

AGENCY_SHORT_NAMES = {
    "sesma", "semec", "sezel", "seinfra", "segbel", "segov", "sefin", "segep",
    "semcad", "semma", "setur", "secult", "semte", "semu", "semel", "pgm",
    "cgm", "codem", "funpapa", "belemprev", "arbel", "promaben", "gmb",
}

EPISODE_RULES = [
    (
        "Protesto/Cobrança",
        {
            "protesto", "manifestação", "manifestacao", "ato", "moradores cobram",
            "moradores reclamam", "cobram", "cobrança", "cobranca", "reclamam",
            "denunciam", "pedem providência", "pedem providencia", "abaixo-assinado",
        },
    ),
    (
        "Saúde",
        {
            "falta médico", "falta medico", "sem médico", "sem medico", "upa",
            "ubs", "posto de saúde", "posto de saude", "medicamento", "remédio",
            "remedio", "consulta", "exame", "fila", "vacina", "atendimento",
        },
    ),
    (
        "Alagamento/Saneamento",
        {
            "alagamento", "alagada", "alagou", "enchente", "canal", "esgoto",
            "drenagem", "saneamento", "boca de lobo", "chuva", "intrafegável",
            "intrafegavel",
        },
    ),
    (
        "Limpeza Urbana",
        {
            "lixo", "entulho", "coleta", "limpeza", "mato", "capina",
            "zeladoria", "descarte irregular",
        },
    ),
    (
        "Obras/Infraestrutura",
        {
            "buraco", "asfalto", "asfaltamento", "pavimentação", "pavimentacao",
            "obra parada", "obra paralisada", "calçada", "calcada", "ponte",
            "tapa-buraco",
        },
    ),
    (
        "Mobilidade/Transporte",
        {
            "ônibus", "onibus", "brt", "trânsito", "transito", "tarifa",
            "parada", "terminal", "semáforo", "semaforo", "mobilidade",
        },
    ),
    (
        "Educação",
        {
            "escola", "creche", "merenda", "matrícula", "matricula",
            "professor", "aluno", "transporte escolar",
        },
    ),
    (
        "Licitação/Controle",
        {
            "denúncia", "denuncia", "irregularidade", "licitação", "licitacao",
            "contrato", "pregão", "pregao", "mppa", "tcm", "tribunal de contas",
            "inquérito", "inquerito", "auditoria", "investigação", "investigacao",
        },
    ),
]

EPISODE_STOPWORDS = STOPWORDS | {
    "belém", "belem", "prefeitura", "municipal", "secretaria", "moradores",
    "prefeito", "gestão", "gestao", "serviço", "servico", "publico", "pública",
    "publica", "contra", "após", "apos", "novo", "nova", "anos", "dias",
}

FEDERAL_OR_STATE_ONLY_TERMS = {
    "ministério da saúde", "ministerio da saude", "governo federal",
    "brasília", "brasilia", "butantan", "anvisa",
}

STATE_UTILITY_ONLY_TERMS = {
    "cosanpa", "companhia de saneamento do pará", "companhia de saneamento do para",
    "águas do pará", "aguas do para", "estação de água bruta", "estacao de agua bruta",
    "desabastecimento de água", "desabastecimento de agua", "falta de água",
    "falta de agua", "abastecimento de água", "abastecimento de agua",
    "concessionária de água", "concessionaria de agua", "tarifa social",
    "conta de água", "conta de agua",
}

MUNICIPAL_HEALTH_CRISIS_TERMS = {
    "sesma", "upa", "ubs", "posto de saúde", "posto de saude", "falta médico",
    "falta medico", "sem médico", "sem medico", "falta de medicamento",
    "falta de remédio", "falta de remedio", "saúde municipal", "saude municipal",
    "hospital municipal", "unidade municipal",
}

PUBLIC_SAFETY_CRISIS_TERMS = {
    "cobram", "cobra", "cobrança", "cobranca", "criticam", "crítica", "critica",
    "denunciam", "denúncia", "denuncia", "falha", "abandono", "insegurança",
    "inseguranca", "protesto", "manifestação", "manifestacao",
}

GENERIC_PROGRAM_ANCHORS = {
    "saneamento básico", "saneamento basico", "modernização dos serviços públicos",
    "modernizacao dos servicos publicos", "inclusão digital", "inclusao digital",
}


def _sentimento_final(m: Mencao, overrides: dict[int, SentimentoOverride]) -> str:
    override = overrides.get(m.id)
    if override:
        return override.sentimento_corrigido
    if m.sentimento_llm:
        return m.sentimento_llm
    return m.sentimento_vtracker or "SEM_QUALIFICACAO"


def _engajamento(m: Mencao) -> int:
    return (m.likes or 0) + (m.shares or 0) + (m.comentarios or 0)


def _tokens(texto: str) -> list[str]:
    normalizado = texto.lower()
    normalizado = re.sub(r"https?://\S+", " ", normalizado)
    normalizado = re.sub(r"@\w+", " ", normalizado)
    normalizado = re.sub(r"[^\w\sáàãâéèêíìîóòõôúùûç]", " ", normalizado)
    return [
        t for t in normalizado.split()
        if len(t) >= 4 and not t.isdigit() and t not in STOPWORDS
    ]


def _base_query(
    db: Session,
    monitoramento: str,
    d_inicio: date,
    d_fim: date,
):
    ini = datetime.combine(d_inicio, datetime.min.time())
    fim = datetime.combine(d_fim + timedelta(days=1), datetime.min.time())
    q = db.query(Mencao).filter(Mencao.data >= ini, Mencao.data < fim)
    if monitoramento != "todos" and monitoramento in MONITORAMENTOS:
        q = q.filter(Mencao.monitoramento_id == MONITORAMENTOS[monitoramento])
    return q.filter(Mencao.llm_processado == True)  # noqa: E712


def _dedup_por_link(mencoes: list[Mencao]) -> list[Mencao]:
    """Remove duplicatas do mesmo post para manter paridade com o Dashboard."""
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


def _mencoes_uteis(mencoes: list[Mencao], overrides: dict[int, SentimentoOverride]) -> list[Mencao]:
    """Base analítica: mesmas menções úteis usadas pelo Dashboard."""
    return [m for m in mencoes if _sentimento_final(m, overrides) != "IRRELEVANTE"]


def _serie_diaria(mencoes: list[Mencao], overrides: dict[int, SentimentoOverride]) -> list[dict]:
    por_dia: dict[str, dict] = defaultdict(lambda: {"total": 0, "negativas": 0, "positivas": 0})
    for m in mencoes:
        if not m.data:
            continue
        key = m.data.date().isoformat()
        sent = _sentimento_final(m, overrides)
        por_dia[key]["total"] += 1
        if sent == "NEGATIVA":
            por_dia[key]["negativas"] += 1
        elif sent == "POSITIVA":
            por_dia[key]["positivas"] += 1
    return [{"data": k, **por_dia[k]} for k in sorted(por_dia)]


def _match_terms(texto: str, terms: set[str], limit: int = 4) -> list[str]:
    encontrados = []
    for term in sorted(terms, key=len, reverse=True):
        term_norm = term.strip().lower()
        if not term_norm:
            continue
        pattern = rf"(?<!\w){re.escape(term_norm)}(?!\w)"
        if re.search(pattern, texto):
            encontrados.append(term_norm)
            if len(encontrados) >= limit:
                break
    return encontrados


def _episode_category(texto: str) -> tuple[Optional[str], list[str]]:
    for categoria, vocab in EPISODE_RULES:
        termos = _match_terms(texto, vocab, limit=3)
        if termos:
            return categoria, termos
    return None, []


def _episode_anchors(texto: str) -> dict[str, list[str]]:
    local_terms = LOCAL_GEOGRAPHY - AMBIGUOUS_LOCAL_GEOGRAPHY
    if has_municipal_anchor(texto):
        local_terms = LOCAL_GEOGRAPHY
    bairros = _match_terms(texto, local_terms, limit=2)
    orgaos = _match_terms(texto, AGENCY_SHORT_NAMES, limit=2)
    if not orgaos:
        orgaos = _match_terms(texto, AGENCIES, limit=1)
    programas = [
        p for p in _match_terms(texto, PROGRAMS_AND_DELIVERIES, limit=2)
        if p not in GENERIC_PROGRAM_ANCHORS
    ][:1]
    riscos = _match_terms(texto, RISK_TERMS, limit=2)
    return {
        "bairros": bairros,
        "orgaos": orgaos,
        "programas": programas,
        "riscos": riscos,
    }


def _episode_keywords(texto: str, termos_categoria: list[str], anchors: dict[str, list[str]]) -> list[str]:
    bloqueados = set(termos_categoria)
    for valores in anchors.values():
        bloqueados.update(valores)
    palavras = [
        t for t in _tokens(texto)
        if t not in EPISODE_STOPWORDS and t not in bloqueados and len(t) >= 5
    ]
    return [p for p, _ in Counter(palavras).most_common(3)]


def _primary_episode_text(m: Mencao) -> str:
    titulo = m.titulo or ""
    texto = (m.texto or "")[:700]
    return f"{titulo} {texto}".strip()


def _is_strategic_narrative_candidate(m: Mencao, overrides: dict[int, SentimentoOverride]) -> bool:
    texto = normalize_for_curation(_primary_episode_text(m))
    sent = _sentimento_final(m, overrides)
    if has_any(texto, GENERIC_CULTURE_TOURISM_TERMS) and not has_any(texto, ACCOUNTABILITY_TERMS):
        return False
    if has_any(texto, GENERIC_PUBLIC_SAFETY_TERMS):
        if not has_any(texto, PUBLIC_SAFETY_CRISIS_TERMS):
            return False
    if sent == "POSITIVA" and not has_any(texto, ACCOUNTABILITY_TERMS):
        return False
    return True


def _episode_signature(m: Mencao) -> Optional[dict]:
    texto_norm = normalize_for_curation(_primary_episode_text(m))
    if has_any(texto_norm, FEDERAL_OR_STATE_ONLY_TERMS) and not has_municipal_anchor(texto_norm):
        return None
    if has_any(texto_norm, STATE_UTILITY_ONLY_TERMS) and not has_any(texto_norm, {"prefeitura", "igor normando", "sesma", "seinfra", "sezel", "segbel", "prefeito"}):
        return None
    categoria, termos_categoria = _episode_category(texto_norm)
    if not categoria:
        return None
    if categoria == "Saúde" and not has_any(texto_norm, MUNICIPAL_HEALTH_CRISIS_TERMS):
        return None
    if categoria == "Mobilidade/Transporte" and has_any(texto_norm, STATE_UTILITY_ONLY_TERMS):
        return None
    if has_any(texto_norm, GENERIC_PUBLIC_SAFETY_TERMS):
        if not has_any(texto_norm, {"prefeitura", "guarda municipal", "gmb", "segbel"}):
            return None
        if not has_any(texto_norm, PUBLIC_SAFETY_CRISIS_TERMS):
            return None

    anchors = _episode_anchors(texto_norm)
    anchor = (
        (anchors["bairros"][0] if anchors["bairros"] else None)
        or (anchors["orgaos"][0] if anchors["orgaos"] else None)
        or (anchors["programas"][0] if anchors["programas"] else None)
    )
    if not anchor:
        return None

    # Crise precisa ser um episódio operacional/político específico, não um tema amplo.
    if categoria == "Licitação/Controle" and not (anchors["orgaos"] or has_any(texto_norm, {"prefeitura de belém", "prefeitura de belem", "igor normando"})):
        return None

    palavras = _episode_keywords(texto_norm, termos_categoria, anchors)
    issue = termos_categoria[0]
    key = "|".join([categoria, anchor, issue])
    return {
        "key": key,
        "categoria": categoria,
        "anchor": anchor,
        "issue": issue,
        "termos": list(dict.fromkeys([*termos_categoria, *palavras]))[:5],
        "anchors": anchors,
    }


def _episode_title(assinatura: dict) -> str:
    anchor = assinatura["anchor"].title()
    issue = assinatura["issue"].replace("-", " ")
    categoria = assinatura["categoria"]
    if categoria == "Protesto/Cobrança":
        return f"{categoria} em {anchor} sobre {issue}"
    return f"{categoria} em {anchor}: {issue}"


def _crisis_level(total: int, engajamento: int, publicadores: int, plataformas: int) -> tuple[str, str, int]:
    """
    Funil de maturidade da crise.
    Potencial: episodio concreto ainda pequeno.
    Incubacao: ganhou repeticao, fonte adicional ou tracao.
    Instalada: volume/engajamento pede resposta coordenada.
    """
    if total >= 5 or engajamento >= 1500 or (total >= 3 and engajamento >= 500):
        return "instalada", "crise instalada", 24
    if total >= 2 or engajamento >= 300 or publicadores >= 2 or plataformas >= 2:
        return "incubacao", "crise em incubação", 12
    return "potencial", "potencial crise", 0


def _crises(mencoes: list[Mencao], overrides: dict[int, SentimentoOverride]) -> list[dict]:
    grupos: dict[str, dict] = {}
    for m in mencoes:
        sent = _sentimento_final(m, overrides)
        if sent != "NEGATIVA":
            continue
        assinatura = _episode_signature(m)
        if not assinatura:
            continue
        grupo = grupos.setdefault(assinatura["key"], {"assinatura": assinatura, "itens": []})
        grupo["itens"].append(m)

    crises = []
    for grupo in grupos.values():
        assinatura = grupo["assinatura"]
        itens = grupo["itens"]
        eng = sum(_engajamento(m) for m in itens)
        plataformas = sorted({m.plataforma for m in itens if m.plataforma})
        publicadores = {m.publicador_nome for m in itens if m.publicador_nome and m.publicador_nome.lower() != "publicador anônimo"}
        nivel, status, bonus_nivel = _crisis_level(len(itens), eng, len(publicadores), len(plataformas))
        score = min(100, len(itens) * 16 + eng // 20 + len(plataformas) * 8 + len(publicadores) * 4 + bonus_nivel)
        top = sorted(itens, key=_engajamento, reverse=True)[:3]
        titulo = _episode_title(assinatura)
        crises.append({
            "tema": titulo,
            "categoria": assinatura["categoria"],
            "assunto": assinatura["issue"],
            "local_ou_orgao": assinatura["anchor"],
            "termos": assinatura["termos"],
            "nivel": nivel,
            "score": score,
            "status": status,
            "mencoes": len(itens),
            "engajamento": eng,
            "plataformas": plataformas,
            "evidencias": [
                {
                    "id": m.id,
                    "texto": (m.texto or m.titulo or "")[:240],
                    "link": m.link or "",
                    "plataforma": m.plataforma or "",
                    "publicador": m.publicador_nome or "",
                    "engajamento": _engajamento(m),
                }
                for m in top
            ],
            "resposta_sugerida": (
                "Acionar acompanhamento coordenado, checar providências com a área responsável e preparar posicionamento com fatos verificáveis."
                if nivel == "instalada"
                else "Abrir monitoramento do episódio, organizar evidências e observar se ganha novas menções ou fontes."
                if nivel == "incubacao"
                else "Registrar como sinal inicial e acompanhar repetição antes de tratar como crise ativa."
            ),
        })
    ordem = {"instalada": 3, "incubacao": 2, "potencial": 1}
    return sorted(crises, key=lambda c: (ordem.get(c["nivel"], 0), c["score"]), reverse=True)[:8]


def _atores(mencoes: list[Mencao], overrides: dict[int, SentimentoOverride]) -> list[dict]:
    grupos: dict[str, list[Mencao]] = defaultdict(list)
    links: dict[str, str] = {}
    for m in mencoes:
        nome = (m.publicador_nome or "").strip()
        if not nome or nome.lower() == "publicador anônimo":
            continue
        grupos[nome].append(m)
        if m.publicador_link:
            links[nome] = m.publicador_link

    atores = []
    for nome, itens in grupos.items():
        total = len(itens)
        if total < 2:
            continue
        positivas = sum(1 for m in itens if _sentimento_final(m, overrides) == "POSITIVA")
        negativas = sum(1 for m in itens if _sentimento_final(m, overrides) == "NEGATIVA")
        eng = sum(_engajamento(m) for m in itens)
        score = round(((positivas - negativas) / total) * 100)
        postura = "crítico" if score < -20 else "aliado" if score > 20 else "neutro"
        atores.append({
            "nome": nome,
            "link": links.get(nome, ""),
            "postura": postura,
            "total": total,
            "positivas": positivas,
            "negativas": negativas,
            "score_sentimento": score,
            "engajamento": eng,
            "plataformas": sorted({m.plataforma for m in itens if m.plataforma}),
        })
    return sorted(atores, key=lambda a: (a["engajamento"], a["total"]), reverse=True)[:12]


def _narrativas(mencoes: list[Mencao], overrides: dict[int, SentimentoOverride]) -> list[dict]:
    grupos: dict[str, list[Mencao]] = defaultdict(list)
    for m in mencoes:
        if not _is_strategic_narrative_candidate(m, overrides):
            continue
        texto_base = _primary_episode_text(m)
        texto_tokens = set(_tokens(texto_base))
        destino = None
        for nome, vocab in NARRATIVAS.items():
            if texto_tokens & vocab:
                destino = nome
                break
        if destino:
            grupos[destino].append(m)

    narrativas = []
    for nome, itens in grupos.items():
        if not itens:
            continue
        total = len(itens)
        positivas = sum(1 for m in itens if _sentimento_final(m, overrides) == "POSITIVA")
        negativas = sum(1 for m in itens if _sentimento_final(m, overrides) == "NEGATIVA")
        neutras = sum(1 for m in itens if _sentimento_final(m, overrides) == "NEUTRA")
        palavras = Counter()
        for m in itens:
            palavras.update(_tokens(_primary_episode_text(m)))
        narrativas.append({
            "nome": nome,
            "total": total,
            "positivas": positivas,
            "negativas": negativas,
            "neutras": neutras,
            "score_sentimento": round(((positivas - negativas) / total) * 100) if total else 0,
            "engajamento": sum(_engajamento(m) for m in itens),
            "termos": [p for p, _ in palavras.most_common(6)],
        })
    return sorted(narrativas, key=lambda n: (n["total"], n["engajamento"]), reverse=True)[:8]


def _recomendacoes(crises: list[dict], narrativas: list[dict], atores: list[dict]) -> list[dict]:
    recs = []
    if crises:
        crise = crises[0]
        recs.append({
            "prioridade": "alta" if crise["score"] >= 70 else "media",
            "acao": f"Tratar narrativa de {crise['tema']}",
            "motivo": f"{crise['mencoes']} menções negativas e score de risco {crise['score']}.",
            "proximo_passo": crise["resposta_sugerida"],
        })
    critica = next((n for n in narrativas if n["nome"] != "Outros" and n["negativas"] > n["positivas"]), None)
    if critica:
        recs.append({
            "prioridade": "alta" if critica["score_sentimento"] < -30 else "media",
            "acao": f"Reforçar comunicação sobre {critica['nome']}",
            "motivo": f"O tema concentra {critica['total']} menções e sentimento {critica['score_sentimento']}.",
            "proximo_passo": "Produzir conteúdo com entrega concreta, dado verificável e responsável institucional.",
        })
    ator = next((a for a in atores if a["postura"] == "crítico"), None)
    if ator:
        recs.append({
            "prioridade": "media",
            "acao": f"Monitorar ator {ator['nome']}",
            "motivo": f"Perfil crítico com {ator['engajamento']} interações no período.",
            "proximo_passo": "Separar histórico, temas recorrentes e avaliar necessidade de resposta indireta.",
        })
    recs.append({
        "prioridade": "media",
        "acao": "Amplificar evidências positivas",
        "motivo": "Balancear a agenda negativa com entregas e validação social dos canais oficiais.",
        "proximo_passo": "Selecionar posts positivos de maior engajamento e adaptar para stories, cards e fala curta.",
    })
    return recs[:5]


def _briefing(
    mencoes: list[Mencao],
    overrides: dict[int, SentimentoOverride],
    crises: list[dict],
    narrativas: list[dict],
    total_uteis: Optional[int] = None,
) -> dict:
    total = len(mencoes)
    positivas = sum(1 for m in mencoes if _sentimento_final(m, overrides) == "POSITIVA")
    negativas = sum(1 for m in mencoes if _sentimento_final(m, overrides) == "NEGATIVA")
    score = round(((positivas - negativas) / total) * 100) if total else 0
    principal = narrativas[0]["nome"] if narrativas else "sem narrativa dominante"
    risco = crises[0]["tema"] if crises else "sem crise ativa"
    return {
        "titulo": "Briefing Executivo",
        "resumo": (
            f"Foram analisadas {total_uteis if total_uteis is not None else total} menções úteis, "
            f"com {total} menções políticas curadas para leitura estratégica. O saldo de sentimento ficou em {score}, "
            f"com narrativa dominante em {principal} e principal risco em {risco}."
        ),
        "whatsapp": (
            f"PoliticAI: {total_uteis if total_uteis is not None else total} menções úteis; {total} políticas curadas. Sentimento {score}. "
            f"Tema principal: {principal}. Risco: {risco}."
        ),
        "kpis": {
            "total": total,
            "positivas": positivas,
            "negativas": negativas,
            "score_sentimento": score,
        },
    }


def _calendario_editorial(narrativas: list[dict], crises: list[dict]) -> list[dict]:
    pautas = []
    dias = ["Hoje", "Amanhã", "D+2", "D+3", "D+4"]
    temas = [n for n in narrativas if n["nome"] != "Outros"][:4]
    if crises:
        crise = crises[0]
        pautas.append({
            "dia": dias[0],
            "tema": f"Resposta sobre {crise['tema']}",
            "formato": "nota curta + card",
            "objetivo": "reduzir ambiguidade e sinalizar providência",
            "gancho": crise["resposta_sugerida"],
            "prioridade": "alta" if crise["score"] >= 70 else "media",
        })
    for idx, tema in enumerate(temas[:4], start=len(pautas)):
        prioridade = "alta" if tema["score_sentimento"] < -15 else "media"
        formato = "reels curto" if tema["engajamento"] > 1000 else "carrossel"
        pautas.append({
            "dia": dias[min(idx, len(dias) - 1)],
            "tema": tema["nome"],
            "formato": formato,
            "objetivo": "explicar entrega, serviço ou posicionamento com linguagem simples",
            "gancho": (
                f"Responder aos termos em circulação: {', '.join(tema['termos'][:4])}."
                if tema["termos"] else "Conectar a pauta a uma entrega verificável."
            ),
            "prioridade": prioridade,
        })
    if not pautas:
        pautas.append({
            "dia": "Hoje",
            "tema": "Balanço positivo da gestão",
            "formato": "card + story",
            "objetivo": "manter presença institucional mesmo sem crise dominante",
            "gancho": "Selecionar uma entrega concreta e mostrar antes/depois.",
            "prioridade": "media",
        })
    return pautas[:5]


def _comparativo_oficial(db: Session, inicio: date, fim: date, narrativas: list[dict]) -> dict:
    ini = datetime.combine(inicio, datetime.min.time())
    end = datetime.combine(fim + timedelta(days=1), datetime.min.time())
    posts = (
        db.query(OfficialPost)
        .filter(OfficialPost.data >= ini, OfficialPost.data < end)
        .order_by(OfficialPost.engajamento.desc())
        .limit(120)
        .all()
    )
    termos_oficiais = Counter()
    engajamento_total = 0
    for post in posts:
        termos_oficiais.update(_tokens(post.texto or ""))
        engajamento_total += int(post.engajamento or 0)

    lacunas = []
    alinhados = []
    termos_set = set(termos_oficiais)
    for narrativa in narrativas:
        if narrativa["nome"] == "Outros":
            continue
        termos_publicos = set(narrativa["termos"])
        intersecao = termos_publicos & termos_set
        item = {
            "tema": narrativa["nome"],
            "demanda_publica": narrativa["total"],
            "sentimento": narrativa["score_sentimento"],
            "termos_publicos": narrativa["termos"][:5],
            "termos_oficiais": [t for t in narrativa["termos"] if t in termos_set][:5],
        }
        if narrativa["total"] >= 20 and not intersecao:
            lacunas.append(item)
        elif intersecao:
            alinhados.append(item)

    return {
        "posts_oficiais": len(posts),
        "engajamento_oficial": engajamento_total,
        "termos_oficiais": [t for t, _ in termos_oficiais.most_common(10)],
        "lacunas": lacunas[:5],
        "alinhamentos": alinhados[:5],
    }


def _mapa_territorial(mencoes: list[Mencao], overrides: dict[int, SentimentoOverride]) -> list[dict]:
    grupos: dict[str, list[Mencao]] = defaultdict(list)
    for m in mencoes:
        local = (m.localizacao or "").strip()
        if not local:
            continue
        grupos[local].append(m)

    territorios = []
    for local, itens in grupos.items():
        total = len(itens)
        positivas = sum(1 for m in itens if _sentimento_final(m, overrides) == "POSITIVA")
        negativas = sum(1 for m in itens if _sentimento_final(m, overrides) == "NEGATIVA")
        territorios.append({
            "local": local,
            "total": total,
            "positivas": positivas,
            "negativas": negativas,
            "score_sentimento": round(((positivas - negativas) / total) * 100) if total else 0,
            "engajamento": sum(_engajamento(m) for m in itens),
        })
    return sorted(territorios, key=lambda t: (t["total"], t["engajamento"]), reverse=True)[:10]


def _gestao_respostas(crises: list[dict], recomendacoes: list[dict]) -> list[dict]:
    respostas = []
    for crise in crises[:4]:
        tom = "institucional e resolutivo" if crise["score"] >= 70 else "monitoramento técnico"
        respostas.append({
            "origem": f"Crise: {crise['tema']}",
            "status": "rascunho",
            "canal": "nota oficial" if crise["score"] >= 70 else "resposta indireta",
            "tom": tom,
            "mensagem": crise["resposta_sugerida"],
        })
    for rec in recomendacoes[:2]:
        respostas.append({
            "origem": f"Ação: {rec['acao']}",
            "status": "planejada",
            "canal": "conteúdo oficial",
            "tom": "didático",
            "mensagem": rec["proximo_passo"],
        })
    return respostas[:6]


def _auditoria_ia(
    db: Session,
    inicio: date,
    fim: date,
    mencoes_uteis: list[Mencao],
    mencoes_processadas_periodo: int,
    mencoes_curadas_politicas: Optional[int] = None,
) -> dict:
    ini = datetime.combine(inicio, datetime.min.time())
    end = datetime.combine(fim + timedelta(days=1), datetime.min.time())
    overrides_periodo = (
        db.query(SentimentoOverride)
        .filter(SentimentoOverride.created_at >= ini, SentimentoOverride.created_at < end)
        .all()
    )
    total = len(mencoes_uteis)
    curadas = mencoes_curadas_politicas if mencoes_curadas_politicas is not None else sum(
        1 for m in mencoes_uteis if is_municipal_political_candidate(m)
    )
    rejeitadas_curadoria = total - curadas
    processadas = mencoes_processadas_periodo
    pendentes = 0
    manuais = [o for o in overrides_periodo if o.source == "manual"]
    autos = [o for o in overrides_periodo if o.source == "llm_auto"]
    divergencias = Counter(
        f"{o.sentimento_vtracker or 'SEM'} -> {o.sentimento_corrigido or 'SEM'}"
        for o in overrides_periodo
        if o.sentimento_vtracker != o.sentimento_corrigido
    )
    taxa_correcao = round((len(manuais) / processadas) * 100, 1) if processadas else 0
    return {
        "mencoes_periodo": total,
        "mencoes_uteis": total,
        "mencoes_curadas_politicas": curadas,
        "mencoes_rejeitadas_curadoria": rejeitadas_curadoria,
        "mencoes_processadas_periodo": processadas,
        "llm_processadas": processadas,
        "llm_pendentes": pendentes,
        "correcoes_manuais": len(manuais),
        "classificacoes_auto": len(autos),
        "taxa_correcao_manual": taxa_correcao,
        "divergencias": [
            {"par": par, "total": qtd}
            for par, qtd in divergencias.most_common(6)
        ],
    }


@router.get("/overview")
def overview(
    data_inicio: Optional[date] = Query(None),
    data_fim: Optional[date] = Query(None),
    monitoramento: str = Query("todos"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fim = data_fim or date.today()
    inicio = data_inicio or (fim - timedelta(days=6))
    cache_key = (monitoramento, inicio.isoformat(), fim.isoformat())
    cached = _OVERVIEW_CACHE.get(cache_key)
    now = time.monotonic()
    if cached and now - cached[0] <= _OVERVIEW_CACHE_TTL_SECONDS:
        return cached[1]

    mencoes_processadas = _base_query(db, monitoramento, inicio, fim).order_by(Mencao.data.desc()).all()
    mencoes_dedup = _dedup_por_link(mencoes_processadas)
    ids = [m.id for m in mencoes_dedup]
    overrides = {}
    if ids:
        rows = db.query(SentimentoOverride).filter(SentimentoOverride.ocorrencia_id.in_(ids)).all()
        overrides = {r.ocorrencia_id: r for r in rows}

    mencoes = _mencoes_uteis(mencoes_dedup, overrides)
    mencoes_curadas = [m for m in mencoes if is_municipal_political_candidate(m)]
    crises = _crises(mencoes_curadas, overrides)
    atores = _atores(mencoes_curadas, overrides)
    narrativas = _narrativas(mencoes_curadas, overrides)
    recomendacoes = _recomendacoes(crises, narrativas, atores)

    result = {
        "periodo": {"inicio": inicio.isoformat(), "fim": fim.isoformat(), "monitoramento": monitoramento},
        "briefing": _briefing(mencoes_curadas, overrides, crises, narrativas, total_uteis=len(mencoes)),
        "crises": crises,
        "atores": atores,
        "narrativas": narrativas,
        "recomendacoes": recomendacoes,
        "calendario_editorial": _calendario_editorial(narrativas, crises),
        "comparativo_oficial": _comparativo_oficial(db, inicio, fim, narrativas),
        "mapa_territorial": _mapa_territorial(mencoes_curadas, overrides),
        "gestao_respostas": _gestao_respostas(crises, recomendacoes),
        "auditoria_ia": _auditoria_ia(db, inicio, fim, mencoes, len(mencoes_processadas), len(mencoes_curadas)),
        "serie": _serie_diaria(mencoes, overrides),
    }
    if len(_OVERVIEW_CACHE) > 32:
        _OVERVIEW_CACHE.clear()
    _OVERVIEW_CACHE[cache_key] = (now, result)
    return result
