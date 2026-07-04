from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, get_db, require_admin
from app.models.mencao import Mencao
from app.models.operation import CrisisCase, HygieneAudit, PoliticalEntity
from app.models.sentimento_override import SentimentoOverride
from app.models.user import User
from app.services.hygiene import higienizar_mencoes_pendentes
from app.services.sync import classificar_todos_pendentes, total_pendentes

router = APIRouter(prefix="/operations", tags=["operations"])


@router.get("/hygiene/summary")
def hygiene_summary(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(HygieneAudit.reason, HygieneAudit.action, sqlfunc.count(HygieneAudit.id))
        .filter(HygieneAudit.created_at >= since)
        .group_by(HygieneAudit.reason, HygieneAudit.action)
        .order_by(sqlfunc.count(HygieneAudit.id).desc())
        .all()
    )
    samples = (
        db.query(HygieneAudit)
        .filter(HygieneAudit.created_at >= since, HygieneAudit.reversed_at.is_(None))
        .order_by(HygieneAudit.created_at.desc())
        .limit(40)
        .all()
    )
    total = sum(int(r[2]) for r in rows)
    return {
        "periodo_dias": days,
        "total_filtrado": total,
        "economia_tokens_estimada": total * 120,
        "motivos": [
            {"reason": reason, "action": action, "total": int(total)}
            for reason, action, total in rows
        ],
        "samples": [_audit_to_dict(a) for a in samples],
    }


@router.post("/hygiene/run")
def hygiene_run(
    limite: int = Body(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return higienizar_mencoes_pendentes(db, limite=limite)


@router.post("/hygiene/{audit_id}/revert")
def hygiene_revert(
    audit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    audit = db.query(HygieneAudit).filter(HygieneAudit.id == audit_id).first()
    if not audit:
        raise HTTPException(404, "Auditoria não encontrada")
    mention = db.query(Mencao).filter(Mencao.id == audit.mencao_id).first()
    if not mention:
        raise HTTPException(404, "Menção não encontrada")
    mention.sentimento_llm = None
    mention.llm_processado = False
    audit.reversed_at = datetime.utcnow()
    audit.reversed_by = current_user.id
    db.commit()
    return {"ok": True}


@router.get("/crises")
def list_crises(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(CrisisCase).order_by(CrisisCase.updated_at.desc().nullslast(), CrisisCase.created_at.desc())
    if status:
        q = q.filter(CrisisCase.status == status)
    return [_crisis_to_dict(c) for c in q.limit(100).all()]


@router.post("/crises")
def create_crisis(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(400, "Título obrigatório")
    case = CrisisCase(
        title=title,
        theme=payload.get("theme"),
        status=payload.get("status") or "monitorando",
        priority=payload.get("priority") or "media",
        owner=payload.get("owner"),
        due_date=_parse_date(payload.get("due_date")),
        evidence=payload.get("evidence") or [],
        response_draft=payload.get("response_draft"),
        created_by=current_user.id,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return _crisis_to_dict(case)


@router.patch("/crises/{case_id}")
def update_crisis(
    case_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    case = db.query(CrisisCase).filter(CrisisCase.id == case_id).first()
    if not case:
        raise HTTPException(404, "Crise não encontrada")
    for field in ("title", "theme", "status", "priority", "owner", "response_draft", "resolution_notes"):
        if field in payload:
            setattr(case, field, payload[field])
    if "due_date" in payload:
        case.due_date = _parse_date(payload.get("due_date"))
    if "evidence" in payload:
        case.evidence = payload.get("evidence") or []
    db.commit()
    db.refresh(case)
    return _crisis_to_dict(case)


@router.get("/entities")
def list_entities(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(PoliticalEntity).order_by(PoliticalEntity.name.asc())
    if q:
        query = query.filter(PoliticalEntity.name.ilike(f"%{q}%"))
    return [_entity_to_dict(e) for e in query.limit(200).all()]


@router.post("/entities")
def create_entity(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nome obrigatório")
    entity = PoliticalEntity(
        name=name,
        kind=payload.get("kind") or "ator",
        aliases=payload.get("aliases") or [],
        stance=payload.get("stance") or "neutro",
        notes=payload.get("notes"),
        active=1 if payload.get("active", True) else 0,
    )
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return _entity_to_dict(entity)


@router.patch("/entities/{entity_id}")
def update_entity(
    entity_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    entity = db.query(PoliticalEntity).filter(PoliticalEntity.id == entity_id).first()
    if not entity:
        raise HTTPException(404, "Entidade não encontrada")
    for field in ("name", "kind", "aliases", "stance", "notes"):
        if field in payload:
            setattr(entity, field, payload[field])
    if "active" in payload:
        entity.active = 1 if payload.get("active") else 0
    db.commit()
    db.refresh(entity)
    return _entity_to_dict(entity)


@router.get("/ai-audit")
def ai_audit(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    total = db.query(sqlfunc.count(Mencao.id)).scalar() or 0
    pendentes = total_pendentes(db)
    processadas = total - pendentes
    manual = db.query(sqlfunc.count(SentimentoOverride.id)).filter(SentimentoOverride.source == "manual").scalar() or 0
    divergencias = (
        db.query(
            SentimentoOverride.sentimento_vtracker,
            SentimentoOverride.sentimento_corrigido,
            sqlfunc.count(SentimentoOverride.id),
        )
        .group_by(SentimentoOverride.sentimento_vtracker, SentimentoOverride.sentimento_corrigido)
        .order_by(sqlfunc.count(SentimentoOverride.id).desc())
        .limit(10)
        .all()
    )
    return {
        "total_mencoes": total,
        "llm_processadas": processadas,
        "llm_pendentes": pendentes,
        "correcoes_manuais": manual,
        "taxa_correcao_manual": round((manual / processadas) * 100, 1) if processadas else 0,
        "divergencias": [
            {"from": origem, "to": destino, "total": int(total)}
            for origem, destino, total in divergencias
            if origem != destino
        ],
    }


@router.post("/ai-audit/reprocess")
def ai_reprocess(
    max_total: int = Body(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    classified = classificar_todos_pendentes(db, max_total=max_total)
    return {"classificadas": classified, "pendentes": total_pendentes(db)}


def _parse_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


def _audit_to_dict(a: HygieneAudit) -> dict:
    return {
        "id": a.id,
        "mencao_id": a.mencao_id,
        "reason": a.reason,
        "action": a.action,
        "label": a.label,
        "text_snapshot": a.text_snapshot,
        "plataforma": a.plataforma,
        "publicador_nome": a.publicador_nome,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "reversed_at": a.reversed_at.isoformat() if a.reversed_at else None,
    }


def _crisis_to_dict(c: CrisisCase) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "theme": c.theme,
        "status": c.status,
        "priority": c.priority,
        "owner": c.owner,
        "due_date": c.due_date.isoformat() if c.due_date else None,
        "evidence": c.evidence or [],
        "response_draft": c.response_draft,
        "resolution_notes": c.resolution_notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def _entity_to_dict(e: PoliticalEntity) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "kind": e.kind,
        "aliases": e.aliases or [],
        "stance": e.stance,
        "notes": e.notes,
        "active": bool(e.active),
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }
