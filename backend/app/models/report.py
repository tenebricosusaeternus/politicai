from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, Float, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    summary = Column(Text)
    content = Column(Text)
    crisis_score = Column(Float)        # 0.0 a 10.0 — índice de crise do dia
    sentiment_score = Column(Float)     # -1.0 a 1.0
    report_date = Column(Date, index=True, nullable=False)
    ai_insights = Column(JSON)          # insights estruturados gerados pela IA
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="reports")

    events = relationship("PoliticalEvent", back_populates="report")
