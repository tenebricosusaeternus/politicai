from sqlalchemy import Column, Integer, String, Text, DateTime, Date, JSON, ForeignKey
from sqlalchemy.sql import func

from app.core.database import Base


class HygieneAudit(Base):
    __tablename__ = "hygiene_audit"

    id = Column(Integer, primary_key=True, index=True)
    mencao_id = Column(Integer, index=True, nullable=False)
    reason = Column(String(80), index=True, nullable=False)
    action = Column(String(40), nullable=False)
    label = Column(String(30), nullable=True)
    text_snapshot = Column(Text, nullable=True)
    plataforma = Column(String(120), nullable=True)
    publicador_nome = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    reversed_at = Column(DateTime(timezone=True), nullable=True)
    reversed_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class PoliticalEntity(Base):
    __tablename__ = "political_entities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    kind = Column(String(80), nullable=False)
    aliases = Column(JSON, nullable=False, default=list)
    stance = Column(String(40), nullable=False, default="neutro")
    notes = Column(Text, nullable=True)
    active = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class CrisisCase(Base):
    __tablename__ = "crisis_cases"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(240), nullable=False)
    theme = Column(String(120), nullable=True)
    status = Column(String(40), nullable=False, default="monitorando")
    priority = Column(String(40), nullable=False, default="media")
    owner = Column(String(160), nullable=True)
    due_date = Column(Date, nullable=True)
    evidence = Column(JSON, nullable=False, default=list)
    response_draft = Column(Text, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
