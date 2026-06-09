from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class Relatorio(Base):
    __tablename__ = "relatorios"

    id = Column(Integer, primary_key=True)
    titulo = Column(String(200), default="Resumo do Dia — Belém")
    periodo_inicio = Column(Date, nullable=False)
    periodo_fim = Column(Date, nullable=False)
    status = Column(String(20), default="rascunho")  # rascunho | publicado

    # Nível de alerta 1–5
    nivel_alerta = Column(Integer, default=3)
    nivel_alerta_justificativa = Column(Text, nullable=True)

    # Conteúdo estruturado (JSON editável)
    temas = Column(JSON, nullable=True)          # {principal: {...}, secundarios: [...]}
    destaques = Column(JSON, nullable=True)       # [{titulo, descricao, alcance, ...}]
    alertas = Column(JSON, nullable=True)         # [{titulo, descricao, alcance, ...}]
    performance_prefeitura = Column(JSON, nullable=True)
    performance_igor = Column(JSON, nullable=True)
    tendencias = Column(JSON, nullable=True)      # {google, twitter, youtube}
    recomendacoes = Column(JSON, nullable=True)   # [{numero, titulo, descricao}]
    resumo = Column(JSON, nullable=True)          # [{titulo, texto}]

    # Editor de blocos (fonte da verdade do corpo do relatório)
    # Lista de { id, tipo, dados:{...} } — tipos: titulo, texto, imagem,
    # grafico, callout, metricas, divisoria
    blocos = Column(JSON, nullable=True)

    gerado_por_llm = Column(String(50), nullable=True)  # "qwen" | "claude"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    usuario_id = Column(Integer, ForeignKey("users.id"), nullable=True)
