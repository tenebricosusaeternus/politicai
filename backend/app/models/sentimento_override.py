from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class SentimentoOverride(Base):
    __tablename__ = "sentimento_overrides"

    id = Column(Integer, primary_key=True, index=True)
    ocorrencia_id = Column(Integer, unique=True, index=True, nullable=False)
    monitoramento_id = Column(Integer, nullable=False)
    texto_snapshot = Column(Text, nullable=True)
    plataforma = Column(String(120), nullable=True)
    publicador_nome = Column(String(200), nullable=True)
    sentimento_vtracker = Column(String(30), nullable=False)
    sentimento_corrigido = Column(String(30), nullable=False)
    observacao = Column(Text, nullable=True)
    # "manual" = corrigido por humano | "llm_auto" = classificado pelo Qwen
    source = Column(String(20), nullable=True, default="manual")
    usuario_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
