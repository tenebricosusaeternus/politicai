from sqlalchemy import (
    Column, Integer, String, Text, Date, DateTime, BigInteger,
    UniqueConstraint, Index, JSON
)
from sqlalchemy.sql import func
from app.core.database import Base


class OfficialInsightAccount(Base):
    __tablename__ = "official_insight_accounts"

    id = Column(Integer, primary_key=True)  # id da conta no V-Tracker
    nome = Column(String(240), nullable=False)
    rede = Column(String(80), nullable=False)
    imagem = Column(Text, nullable=True)
    servico = Column(String(160), nullable=True)
    ativo = Column(Integer, default=1, nullable=False)
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OfficialInsightSnapshot(Base):
    __tablename__ = "official_insight_snapshots"

    id = Column(Integer, primary_key=True)
    conta_id = Column(Integer, nullable=False)
    periodo_inicio = Column(Date, nullable=False)
    periodo_fim = Column(Date, nullable=False)
    perfil = Column(JSON, nullable=False)
    postagens = Column(JSON, nullable=False)
    raw = Column(JSON, nullable=True)
    coletado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("conta_id", "periodo_inicio", "periodo_fim", name="uq_official_snapshot_period"),
        Index("ix_official_snapshot_period", "periodo_inicio", "periodo_fim"),
    )


class OfficialPost(Base):
    __tablename__ = "official_posts"

    id = Column(String(120), primary_key=True)
    conta_id = Column(Integer, nullable=False)
    rede = Column(String(80), nullable=False)
    data = Column(DateTime(timezone=True), nullable=True)
    data_formatada = Column(String(40), nullable=True)
    tipo = Column(String(80), nullable=True)
    texto = Column(Text, nullable=True)
    link = Column(Text, nullable=True)
    thumbnail = Column(Text, nullable=True)
    likes = Column(BigInteger, default=0)
    comentarios = Column(BigInteger, default=0)
    compartilhamentos = Column(BigInteger, default=0)
    salvos = Column(BigInteger, default=0)
    reacoes = Column(BigInteger, default=0)
    engajamento = Column(BigInteger, default=0)
    metricas = Column(JSON, nullable=True)
    atualizado_em = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_official_posts_conta_data", "conta_id", "data"),
        Index("ix_official_posts_engajamento", "engajamento"),
    )
