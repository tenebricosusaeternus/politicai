"""
Serviço de sincronização V-Tracker → banco local.

Fluxo:
  1. Divide o período em janelas de 4 h por monitor
  2. Busca cada janela em paralelo (ThreadPoolExecutor)
  3. Faz upsert na tabela `mencoes` (INSERT … ON CONFLICT DO NOTHING)
  4. Deixa a classificação LLM para o job dedicado de pendências

O V-Tracker não suporta paginação real — ignora o parâmetro `pagina` e
sempre devolve os primeiros ~10 itens. A estratégia de janelas de 4 h
contorna isso: cada janela retorna os 10 itens mais recentes daquele bloco.
"""
import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import engine
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.mencao import Mencao
from app.models.sentimento_override import SentimentoOverride
from app.models.sync_state import SyncState
from app.services.vtracker.client import vtracker, MONITORAMENTOS
from app.services.llm_sentiment import classificar_sentimento, classificar_lote_llm
from app.services.hygiene import higienizar_mencoes_pendentes

logger = logging.getLogger(__name__)

HOURS_PER_WINDOW = 4
SYNC_WORKERS = 15          # chamadas paralelas ao V-Tracker
LLM_BATCH_SIZE = 50        # menções processadas por rodada de LLM
LLM_SYNC_BATCH_SIZE = 60   # maior lote estável observado no MLX/Qwen local
LLM_CLASSIFY_WORKERS = 1   # o servidor MLX/Qwen local não suporta paralelismo estável
RESET_MENTIONS_ON_SYNC = False  # não apaga a base antes de chamadas externas
SYNC_LOCK_ID = 2026060901
CLASSIFY_LOCK_ID = 2026060902


# ─── helpers ────────────────────────────────────────────────────────────────

def _gerar_janelas(d_inicio: date, d_fim: date) -> list:
    """Retorna lista de (inicio_iso, fim_iso) cobrindo d_inicio..d_fim inclusive."""
    windows = []
    cursor = datetime.combine(d_inicio, datetime.min.time())
    end_dt = datetime.combine(d_fim + timedelta(days=1), datetime.min.time())
    while cursor < end_dt:
        win_end = min(cursor + timedelta(hours=HOURS_PER_WINDOW), end_dt)
        windows.append((
            cursor.strftime("%Y-%m-%dT%H:%M:%S"),
            win_end.strftime("%Y-%m-%dT%H:%M:%S"),
        ))
        cursor = win_end
    return windows


def _raw_para_mencao(item: dict, mid: int) -> dict:
    """Converte um dict bruto do V-Tracker para os campos de Mencao."""
    if "conteudo" in item or "monitoramento_id" in item:
        data_raw = item.get("data")
        data_dt = None
        if data_raw:
            for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M"):
                try:
                    data_dt = datetime.strptime(data_raw, fmt)
                    break
                except ValueError:
                    pass

        manifestacoes = item.get("manifestacoes") or []
        metrics = {}
        if isinstance(manifestacoes, list):
            for m in manifestacoes:
                try:
                    metrics[m.get("chave")] = int(float(m.get("valor") or 0))
                except Exception:
                    metrics[m.get("chave")] = 0
        elif isinstance(item.get("manifestacoes_detalhadas"), str):
            try:
                metrics = json.loads(item.get("manifestacoes_detalhadas") or "{}")
            except Exception:
                metrics = {}

        qual = item.get("qualificacao")
        qual_map = {
            "Positivas": "POSITIVA",
            "Positiva": "POSITIVA",
            "POSITIVA": "POSITIVA",
            "Negativas": "NEGATIVA",
            "Negativa": "NEGATIVA",
            "NEGATIVA": "NEGATIVA",
            "Neutras": "NEUTRA",
            "Neutra": "NEUTRA",
            "NEUTRA": "NEUTRA",
            "NENHUMA": None,
            "Nenhuma": None,
        }

        return {
            "id": item["id"],
            "monitoramento_id": int(item.get("monitoramento_id") or mid),
            "link": item.get("link") or None,
            "titulo": item.get("titulo") or None,
            "texto": item.get("conteudo") or item.get("complemento") or None,
            "plataforma": item.get("rede") or item.get("servico") or None,
            "publicador_nome": item.get("publicador_nome") or None,
            "publicador_link": item.get("publicador_link") or None,
            "data": data_dt,
            "likes": int(metrics.get("likes") or metrics.get("like") or 0),
            "shares": int(metrics.get("shares") or metrics.get("share") or 0),
            "comentarios": int(metrics.get("comments") or metrics.get("comentarios") or 0),
            "tipo_conteudo": item.get("tipo_conteudo") or item.get("tipoConteudo") or None,
            "thumbnail": item.get("thumbnail") or item.get("publicador_foto") or None,
            "localizacao": item.get("cidade") or item.get("estado") or None,
            "sentimento_vtracker": qual_map.get(qual, qual) if qual not in (None, "") else None,
            "sentimento_llm": None,
            "llm_processado": False,
        }

    data_ms = item.get("data", 0) or 0
    data_dt = datetime.utcfromtimestamp(data_ms / 1000) if data_ms else None

    manifestacao = item.get("manifestacao") or {}
    if isinstance(manifestacao, str):
        try:
            manifestacao = json.loads(manifestacao)
        except Exception:
            manifestacao = {}
    comentarios = int(manifestacao.get("comments", 0)) if isinstance(manifestacao, dict) else 0

    publicador = item.get("publicador") or {}
    servico = item.get("servico") or {}

    return {
        "id": item["id"],
        "monitoramento_id": mid,
        "link": item.get("link") or None,
        "titulo": item.get("titulo") or None,
        "texto": item.get("descricao") or None,
        "plataforma": servico.get("nome") if isinstance(servico, dict) else None,
        "publicador_nome": publicador.get("nome") if isinstance(publicador, dict) else None,
        "publicador_link": publicador.get("link") if isinstance(publicador, dict) else None,
        "data": data_dt,
        "likes": int(item.get("numeroLikes") or 0),
        "shares": int(item.get("numeroShares") or 0),
        "comentarios": comentarios,
        "tipo_conteudo": item.get("tipoConteudo") or None,
        "thumbnail": item.get("thumbnail") or None,
        "localizacao": item.get("localizacao") or None,
        # "NENHUMA" é como o V-Tracker indica sem qualificação — normaliza para None
        "sentimento_vtracker": item.get("qualificacao") if item.get("qualificacao") not in (None, "", "NENHUMA") else None,
        "sentimento_llm": None,
        "llm_processado": False,
    }


def registrar_sync(db: Session, status: str, resultado: str) -> None:
    """Grava o timestamp/resultado da última sincronização (linha única id=1)."""
    try:
        estado = db.query(SyncState).filter(SyncState.id == 1).first()
        if not estado:
            estado = SyncState(id=1)
            db.add(estado)
        estado.ultima_sincronizacao = datetime.utcnow()
        estado.ultimo_status = status
        estado.ultimo_resultado = resultado[:300]
        db.commit()
    except Exception as e:
        logger.warning("Não registrou estado do sync: %s", e)
        db.rollback()


def _fetch_janela(mid: int, ini: str, fim: str) -> list:
    try:
        items = vtracker.listar_ocorrencias_janela(mid, ini, fim)
        return [_raw_para_mencao(it, mid) for it in items if it.get("id")]
    except Exception as e:
        logger.warning("Falha ao buscar janela %s–%s monitor %s: %s", ini, fim, mid, e)
        return []


def resetar_banco_mencoes(db: Session) -> dict:
    """
    Fase de teste: limpa todo conteúdo importado do V-Tracker antes de uma carga nova.
    Remove também overrides ligados às ocorrências, porque eles podem apontar para
    textos antigos/duplicados depois do reset.
    """
    overrides = db.query(SentimentoOverride).delete(synchronize_session=False)
    mencoes = db.query(Mencao).delete(synchronize_session=False)
    db.commit()
    logger.warning("Reset de teste: %d menções e %d overrides removidos antes do sync", mencoes, overrides)
    return {"mencoes_removidas": mencoes, "overrides_removidos": overrides}


# ─── sync principal ──────────────────────────────────────────────────────────

def sincronizar_periodo(
    db: Session,
    d_inicio: date,
    d_fim: date,
    resetar: bool = RESET_MENTIONS_ON_SYNC,
    classificar: bool = True,
) -> dict:
    """
    Puxa todos os monitores para o período e upserta no banco.
    Retorna {"novos": N, "janelas": M, "erros": K}.
    """
    # Lock numa conexão DEDICADA: advisory lock de sessão vive na conexão; na
    # Session ele cai numa conexão do pool e pode ficar preso numa conexão
    # ociosa (incidente da Embratur em 2026-07-04, produção 8 dias sem sync).
    lock_conn = engine.connect()
    lock_adquirido = bool(lock_conn.execute(text("select pg_try_advisory_lock(:lock_id)"), {"lock_id": SYNC_LOCK_ID}).scalar())
    if not lock_adquirido:
        lock_conn.close()
        registrar_sync(db, "em_andamento", "sync já está em execução")
        return {
            "novos": 0,
            "classificadas": 0,
            "janelas": 0,
            "erros": 1,
            "em_execucao": True,
        }

    try:
        registrar_sync(db, "em_andamento", f"sync {d_inicio.isoformat()}..{d_fim.isoformat()}")
        reset_info = resetar_banco_mencoes(db) if resetar else {"mencoes_removidas": 0, "overrides_removidos": 0}
        windows = _gerar_janelas(d_inicio, d_fim)
        tasks = [(mid, ini, fim)
                 for mid in MONITORAMENTOS.values()
                 for (ini, fim) in windows]

        all_rows: list = []
        with ThreadPoolExecutor(max_workers=SYNC_WORKERS) as pool:
            futures = [pool.submit(_fetch_janela, mid, ini, fim) for mid, ini, fim in tasks]
            for future in as_completed(futures):
                try:
                    all_rows.extend(future.result())
                except Exception:
                    pass

        if not all_rows:
            registrar_sync(db, "ok", f"0 itens ({len(tasks)} janelas)")
            return {"novos": 0, "classificadas": 0, "janelas": len(tasks), "erros": 0, **reset_info}

        # Remove duplicatas dentro do próprio batch (mesmo id de monitors diferentes)
        seen_ids: set = set()
        unique_rows = []
        for row in all_rows:
            if row["id"] not in seen_ids:
                seen_ids.add(row["id"])
                unique_rows.append(row)

        # Upsert: atualiza somente campos mutáveis para preservar sentimento_llm já processado
        stmt = pg_insert(Mencao).values(unique_rows)
        stmt = stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "likes": stmt.excluded.likes,
                "shares": stmt.excluded.shares,
                "comentarios": stmt.excluded.comentarios,
                "atualizado_em": datetime.utcnow(),
            }
        )
        db.execute(stmt)
        db.commit()

        novos = len(unique_rows)
        logger.info("Sync: %d items upsertados (%d janelas × %d monitores)", novos, len(windows), len(MONITORAMENTOS))
        higiene = higienizar_mencoes_pendentes(db, limite=5000) if classificar else {}
        classificadas = classificar_todos_pendentes(db, batch=LLM_SYNC_BATCH_SIZE) if classificar else 0
        relevantes = (
            db.query(Mencao)
            .filter(Mencao.llm_processado == True)  # noqa: E712
            .filter(Mencao.sentimento_llm != "IRRELEVANTE")
            .count()
        )
        irrelevantes = (
            db.query(Mencao)
            .filter(Mencao.llm_processado == True)  # noqa: E712
            .filter(Mencao.sentimento_llm == "IRRELEVANTE")
            .count()
        )
        filtradas = higiene.get("marcadas_irrelevantes", 0) + higiene.get("duplicadas", 0) if higiene else 0
        registrar_sync(db, "ok", f"{novos} itens, {filtradas} filtrados, {classificadas} classificados, {relevantes} relevantes")
        return {
            "novos": novos,
            "pre_filtradas": filtradas,
            "higiene": higiene,
            "classificadas": classificadas,
            "relevantes": relevantes,
            "irrelevantes": irrelevantes,
            "janelas": len(tasks),
            "erros": 0,
            **reset_info,
        }
    except Exception as e:
        registrar_sync(db, "erro", str(e))
        raise
    finally:
        try:
            lock_conn.execute(text("select pg_advisory_unlock(:lock_id)"), {"lock_id": SYNC_LOCK_ID})
        finally:
            lock_conn.close()


def sincronizar_recente(db: Session, dias: int = 7, resetar: bool = RESET_MENTIONS_ON_SYNC) -> dict:
    """Sincroniza os últimos N dias de todos os monitores."""
    hoje = date.today()
    d_inicio = hoje - timedelta(days=dias - 1)
    return sincronizar_periodo(db, d_inicio, hoje, resetar=resetar, classificar=False)


def _try_classify_lock():
    """Adquire o lock de classificação numa conexão DEDICADA.
    Retorna a conexão dona do lock, ou None se outro worker o detém."""
    conn = engine.connect()
    ok = bool(conn.execute(
        text("select pg_try_advisory_lock(:lock_id)"),
        {"lock_id": CLASSIFY_LOCK_ID},
    ).scalar())
    if not ok:
        conn.close()
        return None
    return conn


def _release_classify_lock(conn) -> None:
    try:
        conn.execute(text("select pg_advisory_unlock(:lock_id)"), {"lock_id": CLASSIFY_LOCK_ID})
    finally:
        conn.close()



# ─── classificação LLM ───────────────────────────────────────────────────────

def classificar_pendentes(db: Session, limite: int = LLM_BATCH_SIZE) -> int:
    """
    Classifica as menções que ainda não foram processadas pela LLM.
    Retorna o número de menções classificadas nesta rodada.
    """
    lock_conn = _try_classify_lock()
    if lock_conn is None:
        logger.info("Classificação já está em execução")
        return 0

    try:
        higienizar_mencoes_pendentes(db, limite=max(limite * 5, 100))
        pendentes = (
            db.query(Mencao)
            .filter(Mencao.llm_processado == False)  # noqa: E712
            .order_by(Mencao.data.desc())
            .limit(limite)
            .all()
        )

        if not pendentes:
            return 0

        for m in pendentes:
            texto = m.texto or m.titulo or ""
            lab = classificar_sentimento(texto)
            if lab:
                m.sentimento_llm = lab
                m.llm_processado = True

        db.commit()
        classificadas = sum(1 for m in pendentes if m.llm_processado)
        logger.info("LLM: %d menções classificadas", classificadas)
        return classificadas
    finally:
        _release_classify_lock(lock_conn)


def _chunks(seq: list, size: int) -> list[list]:
    return [seq[i:i + size] for i in range(0, len(seq), size)]


def _classificar_chunk(textos: list[str]) -> list[str]:
    labels = classificar_lote_llm(textos)
    if labels and all(lab is None for lab in labels):
        return labels
    result = []
    for texto, lab in zip(textos, labels):
        result.append(lab or classificar_sentimento(texto))
    return result


def classificar_todos_pendentes(
    db: Session,
    batch: int = LLM_SYNC_BATCH_SIZE,
    max_total: int = None,
    workers: int = LLM_CLASSIFY_WORKERS,
) -> int:
    """
    Classifica TODAS as menções pendentes em lotes paralelos.
    Cada worker faz uma chamada HTTP independente ao Qwen local.
    Retorna o total classificado.
    """
    lock_conn = _try_classify_lock()
    if lock_conn is None:
        logger.info("Classificação já está em execução")
        return 0

    processados = 0
    try:
        workers = max(1, workers)
        batch = max(1, batch)
        while True:
            higienizar_mencoes_pendentes(db, limite=max(batch * workers * 5, 250))
            limite = batch * workers
            if max_total:
                limite = min(limite, max_total - processados)
                if limite <= 0:
                    break

            pendentes = (
                db.query(Mencao)
                .filter(Mencao.llm_processado == False)  # noqa: E712
                .order_by(Mencao.data.desc())
                .limit(limite)
                .all()
            )
            if not pendentes:
                break

            textos = [(m.texto or m.titulo or "") for m in pendentes]
            labels: list[str] = []
            partes = _chunks(textos, batch)
            with ThreadPoolExecutor(max_workers=min(workers, len(partes))) as pool:
                futures = [pool.submit(_classificar_chunk, parte) for parte in partes]
                for future in futures:
                    labels.extend(future.result())

            classificadas_rodada = 0
            for m, lab in zip(pendentes, labels):
                if not lab:
                    continue
                m.sentimento_llm = lab
                m.llm_processado = True
                classificadas_rodada += 1
            db.commit()

            if classificadas_rodada == 0:
                raise RuntimeError("LLM indisponível: nenhuma menção foi classificada nesta rodada")

            processados += classificadas_rodada
            logger.info(
                "Classificação paralela: %d processados nesta execução (%d por chamada × %d workers)",
                processados,
                batch,
                workers,
            )
        return processados
    finally:
        _release_classify_lock(lock_conn)


def total_pendentes(db: Session) -> int:
    return db.query(Mencao).filter(Mencao.llm_processado == False).count()  # noqa: E712


# ─── status ─────────────────────────────────────────────────────────────────

def status_banco(db: Session) -> dict:
    from sqlalchemy import func as sqlfunc
    total = db.query(sqlfunc.count(Mencao.id)).scalar() or 0
    pendentes = total_pendentes(db)
    mais_antiga = db.query(sqlfunc.min(Mencao.data)).scalar()
    mais_recente = db.query(sqlfunc.max(Mencao.data)).scalar()

    # "Última atualização" vem do SyncState (confiável, mesmo com 0 novos).
    # Fallback: max(atualizado_em) das menções, para bancos pré-existentes.
    estado = db.query(SyncState).filter(SyncState.id == 1).first()
    if estado and estado.ultima_sincronizacao:
        ultima = estado.ultima_sincronizacao
        ultimo_status = estado.ultimo_status
        ultimo_resultado = estado.ultimo_resultado
    else:
        ultima = db.query(sqlfunc.max(Mencao.atualizado_em)).scalar()
        ultimo_status = "ok" if ultima else None
        ultimo_resultado = None

    return {
        "total_mencoes": total,
        "llm_pendentes": pendentes,
        "llm_processadas": total - pendentes,
        "ultima_sincronizacao": ultima.isoformat() if ultima else None,
        "ultimo_status": ultimo_status,
        "ultimo_resultado": ultimo_resultado,
        "data_mais_antiga": mais_antiga.isoformat() if mais_antiga else None,
        "data_mais_recente": mais_recente.isoformat() if mais_recente else None,
    }
