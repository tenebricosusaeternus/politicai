from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class SyncState(Base):
    """
    Estado da última sincronização com o V-Tracker (linha única, id=1).
    Permite mostrar no dashboard "última atualização" de forma confiável,
    mesmo quando um sync não traz registros novos.
    """
    __tablename__ = "sync_state"

    id = Column(Integer, primary_key=True)
    ultima_sincronizacao = Column(DateTime(timezone=True), nullable=True)
    ultimo_status = Column(String(20), default="ok")        # ok | erro
    ultimo_resultado = Column(String(300), nullable=True)   # resumo legível
    atualizado_em = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
