"""
Regras determinísticas de pré-higienização para economizar chamadas à LLM.

As regras aqui devem ser conservadoras: só classificam como IRRELEVANTE quando
o ruído é evidente. Casos ambíguos continuam pendentes para a LLM.
"""
import re
from dataclasses import dataclass
from hashlib import sha1
from typing import Optional

from sqlalchemy.orm import Session

from app.models.mencao import Mencao
from app.models.operation import HygieneAudit
from app.services.monitoring_taxonomy import (
    FOOTBALL_TERMS,
    LOW_PRIORITY_EXCLUSIONS,
    NEGATIVE_EXCLUSIONS,
    STRONG_MUNICIPAL_SIGNALS,
    WEAK_LOCAL_SIGNAL_TERMS,
)


URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)
MENTION_RE = re.compile(r"@\w+")
MULTISPACE_RE = re.compile(r"\s+")
PUNCT_RE = re.compile(r"[^\w\sáàãâéèêíìîóòõôúùûç]", re.I)

SPAM_PATTERNS = [
    r"\bsorteio\b",
    r"\bpromo(?:ção|cao)\b",
    r"\bcompre\b",
    r"\bclique aqui\b",
    r"\blink na bio\b",
    r"\barraste para cima\b",
    r"\bganhe\b",
    r"\bdesconto\b",
    r"\bcupom\b",
    r"\bbet\b",
    r"\bapostas?\b",
    r"\bpack\b",
    r"\bconteúdo adulto\b",
    r"\bconteudo adulto\b",
]

LOW_SIGNAL_PATTERNS = [
    r"^\s*(bom dia|boa tarde|boa noite|amém|amen|kkkk+|rsrs+|top|show|up)\s*[!.]*\s*$",
    r"^\s*[#@\w\s]{0,20}\s*$",
]

OFFTOPIC_PATTERNS = [rf"\b{re.escape(term)}\b" for term in sorted(NEGATIVE_EXCLUSIONS)]
LOW_PRIORITY_PATTERNS = [rf"\b{re.escape(term)}\b" for term in sorted(LOW_PRIORITY_EXCLUSIONS)]


@dataclass(frozen=True)
class HygieneDecision:
    label: Optional[str]
    reason: str
    normalized_text: str
    fingerprint: str


def normalizar_texto(texto: str) -> str:
    texto = (texto or "").strip().lower()
    texto = URL_RE.sub(" ", texto)
    texto = MENTION_RE.sub(" ", texto)
    texto = PUNCT_RE.sub(" ", texto)
    return MULTISPACE_RE.sub(" ", texto).strip()


def fingerprint_texto(texto: str) -> str:
    normalizado = normalizar_texto(texto)
    return sha1(normalizado.encode("utf-8")).hexdigest() if normalizado else ""


def _match_any(texto: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, texto, re.I) for pattern in patterns)


def _has_any_term(texto: str, terms: set[str]) -> bool:
    return any(term in texto for term in terms)


def decidir_higiene(m: Mencao) -> HygieneDecision:
    bruto = f"{m.titulo or ''} {m.texto or ''}".strip()
    normalizado = normalizar_texto(bruto)
    fp = fingerprint_texto(bruto)

    if not normalizado:
        return HygieneDecision("IRRELEVANTE", "texto_vazio", normalizado, fp)

    if len(normalizado) < 12:
        return HygieneDecision("IRRELEVANTE", "texto_curto_sem_sinal", normalizado, fp)

    if _match_any(normalizado, LOW_SIGNAL_PATTERNS):
        return HygieneDecision("IRRELEVANTE", "baixo_sinal", normalizado, fp)

    has_strong_signal = _has_any_term(normalizado, STRONG_MUNICIPAL_SIGNALS)
    has_weak_local_signal = _has_any_term(normalizado, WEAK_LOCAL_SIGNAL_TERMS)

    if _match_any(normalizado, SPAM_PATTERNS) and not has_strong_signal:
        return HygieneDecision("IRRELEVANTE", "spam_comercial", normalizado, fp)

    if _match_any(normalizado, LOW_PRIORITY_PATTERNS) and not has_strong_signal:
        return HygieneDecision("IRRELEVANTE", "baixa_prioridade_sem_sinal_municipal", normalizado, fp)

    if _match_any(normalizado, OFFTOPIC_PATTERNS) and not has_strong_signal:
        return HygieneDecision("IRRELEVANTE", "belem_homonimo_ou_offtopic", normalizado, fp)

    # Posts de futebol puro costumam entrar pelo termo Belém/Pará, mas não
    # ajudam análise de gestão quando não citam cidade, prefeitura ou serviço.
    if _has_any_term(normalizado, FOOTBALL_TERMS) and not has_strong_signal:
        return HygieneDecision("IRRELEVANTE", "futebol_sem_contexto_municipal", normalizado, fp)

    if normalizado in {"belém", "belem", "#belém", "#belem"}:
        return HygieneDecision("IRRELEVANTE", "belem_sozinho", normalizado, fp)

    return HygieneDecision(None, "avaliar_por_llm", normalizado, fp)


def higienizar_mencoes_pendentes(db: Session, limite: int = 1000) -> dict:
    """
    Marca ruídos óbvios como IRRELEVANTE antes da LLM.
    Também elimina duplicatas textuais exatas dentro da rodada, preservando uma
    cópia para a LLM quando o texto for potencialmente relevante.
    """
    pendentes = (
        db.query(Mencao)
        .filter(Mencao.llm_processado == False)  # noqa: E712
        .order_by(Mencao.data.desc())
        .limit(limite)
        .all()
    )
    seen_fingerprints: set[str] = set()
    counts = {
        "avaliar_por_llm": 0,
        "marcadas_irrelevantes": 0,
        "duplicadas": 0,
        "motivos": {},
    }

    def audit(m: Mencao, reason: str, action: str, label: str) -> None:
        exists = db.query(HygieneAudit).filter(
            HygieneAudit.mencao_id == m.id,
            HygieneAudit.reason == reason,
            HygieneAudit.reversed_at.is_(None),
        ).first()
        if exists:
            return
        db.add(HygieneAudit(
            mencao_id=m.id,
            reason=reason,
            action=action,
            label=label,
            text_snapshot=(m.texto or m.titulo or "")[:800],
            plataforma=m.plataforma,
            publicador_nome=m.publicador_nome,
        ))

    for m in pendentes:
        decision = decidir_higiene(m)
        if decision.label == "IRRELEVANTE":
            m.sentimento_llm = "IRRELEVANTE"
            m.llm_processado = True
            audit(m, decision.reason, "auto_irrelevante", "IRRELEVANTE")
            counts["marcadas_irrelevantes"] += 1
            counts["motivos"][decision.reason] = counts["motivos"].get(decision.reason, 0) + 1
            continue

        if decision.fingerprint and decision.fingerprint in seen_fingerprints:
            m.sentimento_llm = "IRRELEVANTE"
            m.llm_processado = True
            audit(m, "duplicata_textual", "auto_irrelevante", "IRRELEVANTE")
            counts["duplicadas"] += 1
            counts["motivos"]["duplicata_textual"] = counts["motivos"].get("duplicata_textual", 0) + 1
            continue

        if decision.fingerprint:
            seen_fingerprints.add(decision.fingerprint)
        counts["avaliar_por_llm"] += 1

    db.commit()
    return counts
