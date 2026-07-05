"""Lock distribuído por job do scheduler (guarda multi-worker).

Com mais de um worker uvicorn (ou mais de um processo do backend apontando
para o mesmo banco), cada processo sobe o próprio APScheduler e os jobs
rodariam em duplicidade. Este módulo dá exclusão mútua via advisory lock de
SESSÃO do Postgres: quem não pega o lock PULA a execução (não espera) — o
próximo tick tenta de novo.

Fora do Postgres (SQLite em dev/teste) não existe advisory lock; aí o lock é
sempre concedido, porque só há um processo nesses cenários.
"""
from __future__ import annotations

import hashlib
import logging
from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# Namespace fixo somado à chave para não colidir com outros usos de advisory
# lock no mesmo banco.
_NAMESPACE = "embratur-scheduler"


def job_lock_key(job_name: str) -> int:
    """Chave bigint estável (assinada, 64 bits) para pg_try_advisory_lock."""
    digest = hashlib.sha256(f"{_NAMESPACE}:{job_name}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=True)


@contextmanager
def job_guard(engine: Engine, job_name: str, key: "int | None" = None) -> Iterator[bool]:
    """Tenta o lock do job; yield True se este processo deve executar.

    Usa uma conexão DEDICADA (não a Session do job): advisory lock de sessão
    vive na conexão, e a Session devolve a conexão ao pool a cada commit —
    lock e unlock na Session podem cair em conexões diferentes e deixar o
    lock preso numa conexão ociosa do pool. O unlock acontece no fim do
    bloco; se o processo morrer, o Postgres solta o lock junto com a conexão.

    `key` explícita serve para locks legados com id numérico fixo (sync.py);
    sem ela, a chave é derivada do nome do job.
    """
    if engine.dialect.name != "postgresql":
        yield True
        return

    if key is None:
        key = job_lock_key(job_name)
    conn = engine.connect()
    try:
        acquired = bool(conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": key}).scalar())
        if not acquired:
            yield False
            return
        try:
            yield True
        finally:
            try:
                conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": key})
            except Exception:  # noqa: BLE001 — fechar a conexão já libera o lock
                logger.warning("job_guard: unlock de %s falhou; conexão será fechada", job_name)
    finally:
        conn.close()
