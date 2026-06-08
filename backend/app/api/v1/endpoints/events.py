from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import List, Optional
from app.core.database import get_db
from app.api.v1.deps import get_current_user
from app.models.user import User
from app.models.political_event import PoliticalEvent, EventSeverity, EventSource
from app.schemas.political_event import PoliticalEventOut

router = APIRouter(prefix="/events", tags=["events"])


@router.get("/", response_model=List[PoliticalEventOut])
def list_events(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    severity: Optional[EventSeverity] = Query(None),
    source: Optional[EventSource] = Query(None),
    location: Optional[str] = Query(None),
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

    return query.limit(200).all()


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
