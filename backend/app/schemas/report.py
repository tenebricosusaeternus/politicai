from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, Any


class ReportOut(BaseModel):
    id: int
    title: str
    summary: Optional[str]
    crisis_score: Optional[float]
    sentiment_score: Optional[float]
    report_date: date
    ai_insights: Optional[Any]
    created_at: datetime

    model_config = {"from_attributes": True}


class ReportDetail(ReportOut):
    content: Optional[str]
