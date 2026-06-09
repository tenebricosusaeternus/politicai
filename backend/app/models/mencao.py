from sqlalchemy import (
    Column, BigInteger, Integer, Boolean, String, Text,
    DateTime, Index
)
from sqlalchemy.sql import func
from app.core.database import Base


class Mencao(Base):
    __tablename__ = "mencoes"

    # ID original do V-Tracker — chave primária estável
    id = Column(BigInteger, primary_key=True)

    monitoramento_id = Column(Integer, nullable=False)
    link = Column(Text, nullable=True)
    titulo = Column(Text, nullable=True)
    texto = Column(Text, nullable=True)           # campo "descricao" do V-Tracker
    plataforma = Column(String(120), nullable=True)
    publicador_nome = Column(String(200), nullable=True)
    publicador_link = Column(Text, nullable=True)
    data = Column(DateTime(timezone=True), nullable=True)

    likes = Column(Integer, default=0)
    shares = Column(Integer, default=0)
    comentarios = Column(Integer, default=0)
    tipo_conteudo = Column(String(100), nullable=True)
    thumbnail = Column(Text, nullable=True)
    localizacao = Column(String(200), nullable=True)

    # Sentimentos
    sentimento_vtracker = Column(String(30), nullable=True)   # qualificacao original
    sentimento_llm = Column(String(30), nullable=True)        # POSITIVA/NEGATIVA/NEUTRA/IRRELEVANTE
    llm_processado = Column(Boolean, default=False, nullable=False)

    # Controle interno
    coletado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_mencoes_monitoramento_data", "monitoramento_id", "data"),
        Index("ix_mencoes_data", "data"),
        Index("ix_mencoes_llm_pendente", "llm_processado"),
    )
