from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, Float, JSON, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.core.database import Base


class EventSource(str, enum.Enum):
    vtracker = "vtracker"
    scraping = "scraping"
    social_media = "social_media"
    manual = "manual"


class EventSeverity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class PoliticalEvent(Base):
    __tablename__ = "political_events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text)
    source = Column(SAEnum(EventSource), nullable=False)
    source_url = Column(String)
    severity = Column(SAEnum(EventSeverity), default=EventSeverity.low)
    sentiment_score = Column(Float)         # -1.0 a 1.0
    actors = Column(JSON)                   # lista de atores políticos envolvidos
    tags = Column(JSON)                     # ex: ["corrupção", "eleições", "STF"]
    location = Column(String)               # estado ou município
    event_date = Column(Date, index=True, nullable=False)
    raw_data = Column(JSON)                 # dado original da fonte
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    report_id = Column(Integer, ForeignKey("reports.id"), nullable=True)
    report = relationship("Report", back_populates="events")
