from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, Any, List
from app.models.political_event import EventSource, EventSeverity


class PoliticalEventOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    source: EventSource
    source_url: Optional[str]
    severity: EventSeverity
    sentiment_score: Optional[float]
    actors: Optional[Any]
    tags: Optional[Any]
    location: Optional[str]
    event_date: date
    created_at: datetime

    model_config = {"from_attributes": True}


class EventFilterParams(BaseModel):
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    severity: Optional[EventSeverity] = None
    source: Optional[EventSource] = None
    location: Optional[str] = None
    tags: Optional[List[str]] = None
