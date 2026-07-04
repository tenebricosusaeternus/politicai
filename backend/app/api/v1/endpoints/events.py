from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
from typing import List, Optional
from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User, UserRole
from app.models.mencao import Mencao
from app.models.political_event import PoliticalEvent, EventSeverity, EventSource
from app.models.sentimento_override import SentimentoOverride
from app.schemas.political_event import PoliticalEventOut
from app.services.curation import is_municipal_political_candidate
from app.api.v1.endpoints.intelligence import _base_query, _crises, _dedup_por_link, _mencoes_uteis

router = APIRouter(prefix="/events", tags=["events"])

CRISIS_STATUS = {"candidate", "approved", "rejected", "monitoring", "resolved"}


@router.get("/", response_model=List[PoliticalEventOut])
def list_events(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    severity: Optional[EventSeverity] = Query(None),
    source: Optional[EventSource] = Query(None),
    location: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(PoliticalEvent).order_by(PoliticalEvent.event_date.desc(), PoliticalEvent.created_at.desc())

    if date_from:
        query = query.filter(PoliticalEvent.event_date >= date_from)
    if date_to:
        query = query.filter(PoliticalEvent.event_date <= date_to)
    if severity:
        query = query.filter(PoliticalEvent.severity == severity)
    if source:
        query = query.filter(PoliticalEvent.source == source)
    if location:
        query = query.filter(PoliticalEvent.location.ilike(f"%{location}%"))

    rows = query.limit(500).all()
    if status and status != "all":
        rows = [
            r for r in rows
            if ((r.raw_data or {}).get("crisis_status") or "approved") == status
        ]
    return rows[:200]


@router.get("/crisis-candidates")
def crisis_candidates(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fim = date_to or date.today()
    inicio = date_from or (fim - timedelta(days=6))
    mencoes_processadas = _base_query(db, "todos", inicio, fim).order_by(Mencao.data.desc()).all()
    mencoes_dedup = _dedup_por_link(mencoes_processadas)
    ids = [m.id for m in mencoes_dedup]
    overrides = {}
    if ids:
        rows = db.query(SentimentoOverride).filter(SentimentoOverride.ocorrencia_id.in_(ids)).all()
        overrides = {r.ocorrencia_id: r for r in rows}
    mencoes = _mencoes_uteis(mencoes_dedup, overrides)
    curadas = [m for m in mencoes if is_municipal_political_candidate(m)]
    crises = _crises(curadas, overrides)

    keys = [_candidate_key(c) for c in crises]
    existing = db.query(PoliticalEvent).filter(PoliticalEvent.event_date >= inicio, PoliticalEvent.event_date <= fim).all()
    status_by_key = {
        (r.raw_data or {}).get("crisis_candidate_key"): (r.raw_data or {}).get("crisis_status", "approved")
        for r in existing
        if (r.raw_data or {}).get("crisis_candidate_key")
    }
    return [
        {
            **c,
            "candidate_key": key,
            "curation_status": status_by_key.get(key, "candidate"),
        }
        for c, key in zip(crises, keys)
    ]


@router.post("/crisis-candidates/approve", response_model=PoliticalEventOut)
def approve_crisis_candidate(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    crise = payload.get("crise") or payload
    key = crise.get("candidate_key") or _candidate_key(crise)
    existing = _find_by_candidate_key(db, key)
    raw = {
        **((existing.raw_data if existing else {}) or {}),
        "crisis_status": "approved",
        "crisis_candidate_key": key,
        "crisis_payload": crise,
    }
    ev = existing or PoliticalEvent(source=EventSource.vtracker, event_date=date.today())
    ev.title = crise.get("tema") or "Crise em acompanhamento"
    ev.description = crise.get("resposta_sugerida") or ""
    ev.source_url = _first_evidence_link(crise)
    ev.severity = _severity_from_crisis_level(crise.get("nivel"))
    ev.sentiment_score = -1.0
    ev.actors = _actors_from_crisis(crise)
    ev.tags = [x for x in [crise.get("categoria"), crise.get("assunto"), crise.get("nivel")] if x]
    ev.location = crise.get("local_ou_orgao")
    ev.raw_data = raw
    if not existing:
        db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.post("/crisis-candidates/reject", response_model=PoliticalEventOut)
def reject_crisis_candidate(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    crise = payload.get("crise") or payload
    key = crise.get("candidate_key") or _candidate_key(crise)
    existing = _find_by_candidate_key(db, key)
    raw = {
        **((existing.raw_data if existing else {}) or {}),
        "crisis_status": "rejected",
        "crisis_candidate_key": key,
        "crisis_payload": crise,
        "rejection_reason": payload.get("reason") or "",
    }
    ev = existing or PoliticalEvent(source=EventSource.vtracker, event_date=date.today())
    ev.title = crise.get("tema") or "Crise rejeitada"
    ev.description = payload.get("reason") or crise.get("resposta_sugerida") or ""
    ev.source_url = _first_evidence_link(crise)
    ev.severity = _severity_from_crisis_level(crise.get("nivel"))
    ev.sentiment_score = -1.0
    ev.actors = _actors_from_crisis(crise)
    ev.tags = [x for x in [crise.get("categoria"), crise.get("assunto"), "rejeitada"] if x]
    ev.location = crise.get("local_ou_orgao")
    ev.raw_data = raw
    if not existing:
        db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.post("/", response_model=PoliticalEventOut)
def create_event(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    ev = PoliticalEvent(
        title=(payload.get("title") or "").strip(),
        description=(payload.get("description") or "").strip() or None,
        source=EventSource.manual,
        source_url=(payload.get("source_url") or "").strip() or None,
        severity=EventSeverity(payload.get("severity") or "medium"),
        sentiment_score=-1.0 if payload.get("severity") in {"high", "critical"} else None,
        actors=payload.get("actors") or [],
        tags=payload.get("tags") or [],
        location=(payload.get("location") or "").strip() or None,
        event_date=date.fromisoformat(payload.get("event_date")) if payload.get("event_date") else date.today(),
        raw_data={"crisis_status": payload.get("status") or "approved", "manual": True},
    )
    if not ev.title:
        raise HTTPException(400, "Informe um título para a crise.")
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return ev


@router.patch("/{event_id}", response_model=PoliticalEventOut)
def update_event(
    event_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    ev = db.query(PoliticalEvent).filter(PoliticalEvent.id == event_id).first()
    if not ev:
        raise HTTPException(404, "Crise não encontrada")
    for field in ["title", "description", "source_url", "location"]:
        if field in payload:
            setattr(ev, field, payload[field])
    if "severity" in payload:
        ev.severity = EventSeverity(payload["severity"])
    if "event_date" in payload:
        ev.event_date = date.fromisoformat(payload["event_date"])
    if "actors" in payload:
        ev.actors = payload["actors"]
    if "tags" in payload:
        ev.tags = payload["tags"]
    if "status" in payload:
        if payload["status"] not in CRISIS_STATUS:
            raise HTTPException(400, "Status inválido")
        raw = dict(ev.raw_data or {})
        raw["crisis_status"] = payload["status"]
        ev.raw_data = raw
    db.commit()
    db.refresh(ev)
    return ev


@router.get("/today", response_model=List[PoliticalEventOut])
def events_today(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(PoliticalEvent)
        .filter(PoliticalEvent.event_date == date.today())
        .order_by(PoliticalEvent.severity.desc())
        .all()
    )


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem curar crises")


def _candidate_key(crise: dict) -> str:
    return "|".join(str(crise.get(k) or "") for k in ["categoria", "assunto", "local_ou_orgao", "tema"])


def _find_by_candidate_key(db: Session, key: str) -> Optional[PoliticalEvent]:
    rows = db.query(PoliticalEvent).order_by(PoliticalEvent.created_at.desc()).limit(500).all()
    for row in rows:
        if (row.raw_data or {}).get("crisis_candidate_key") == key:
            return row
    return None


def _severity_from_crisis_level(level: Optional[str]) -> EventSeverity:
    if level == "instalada":
        return EventSeverity.critical
    if level == "incubacao":
        return EventSeverity.high
    if level == "potencial":
        return EventSeverity.medium
    return EventSeverity.low


def _first_evidence_link(crise: dict) -> Optional[str]:
    for ev in crise.get("evidencias") or []:
        if ev.get("link"):
            return ev["link"]
    return None


def _actors_from_crisis(crise: dict) -> list[str]:
    atores = []
    for ev in crise.get("evidencias") or []:
        pub = (ev.get("publicador") or "").strip()
        if pub and pub.lower() != "publicador anônimo" and pub not in atores:
            atores.append(pub)
    return atores[:8]
