import os
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.api.v1.deps import get_current_user, get_db
from app.core.database import SessionLocal
from app.models.user import User, UserRole
from app.models.relatorio import Relatorio

router = APIRouter(prefix="/reports", tags=["reports"])

EXT_IMG = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
_REPORT_EXECUTOR = ThreadPoolExecutor(max_workers=1)
_REPORT_JOBS_LOCK = threading.Lock()
_REPORT_JOBS: dict[str, dict] = {}


# ─── listagem ────────────────────────────────────────────────────────────────

@router.get("/")
def listar_relatorios(
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total = db.query(Relatorio).count()
    rows = (
        db.query(Relatorio)
        .order_by(desc(Relatorio.periodo_fim))
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"total": total, "items": [_to_list_item(r) for r in rows]}


@router.post("/gerar")
def gerar_relatorio(
    periodo_inicio: date = Body(...),
    periodo_fim: Optional[date] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gera um novo relatório via LLM para o período informado."""
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem gerar relatórios")

    d_ini = periodo_inicio
    d_fim = periodo_fim or periodo_inicio

    from app.services.relatorio_llm import gerar_relatorio_dados, montar_blocos
    try:
        dados = gerar_relatorio_dados(db, d_ini, d_fim)
    except Exception as e:
        raise HTTPException(502, f"Falha na geração via LLM: {e}")

    rel = Relatorio(
        titulo="Resumo do Dia — Belém",
        periodo_inicio=d_ini,
        periodo_fim=d_fim,
        status="rascunho",
        nivel_alerta=dados.get("nivel_alerta", 3),
        nivel_alerta_justificativa=dados.get("nivel_alerta_justificativa", ""),
        temas=dados.get("temas"),
        destaques=dados.get("destaques"),
        alertas=dados.get("alertas"),
        performance_prefeitura=dados.get("performance_prefeitura"),
        performance_igor=dados.get("performance_igor"),
        tendencias=dados.get("tendencias", {"google": "", "twitter": "", "youtube": ""}),
        recomendacoes=dados.get("recomendacoes"),
        resumo=dados.get("resumo"),
        blocos=montar_blocos(dados),
        gerado_por_llm="qwen",
        usuario_id=current_user.id,
    )
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return _to_detail(rel, db)


@router.post("/gerar-background")
def gerar_relatorio_background(
    periodo_inicio: date = Body(...),
    periodo_fim: Optional[date] = Body(None),
    current_user: User = Depends(get_current_user),
):
    """Inicia geração em background e retorna um job para polling."""
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem gerar relatórios")

    d_ini = periodo_inicio
    d_fim = periodo_fim or periodo_inicio
    job_id = uuid.uuid4().hex
    with _REPORT_JOBS_LOCK:
        _REPORT_JOBS[job_id] = {
            "id": job_id,
            "status": "queued",
            "progress": 5,
            "message": "Relatório entrou na fila de geração.",
            "relatorio_id": None,
            "error": None,
            "periodo_inicio": d_ini.isoformat(),
            "periodo_fim": d_fim.isoformat(),
        }
    _REPORT_EXECUTOR.submit(_run_report_job, job_id, d_ini, d_fim, current_user.id)
    return _REPORT_JOBS[job_id]


@router.get("/jobs/{job_id}")
def get_report_job(
    job_id: str,
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem consultar geração")
    with _REPORT_JOBS_LOCK:
        job = _REPORT_JOBS.get(job_id)
        if not job:
            raise HTTPException(404, "Job não encontrado")
        return dict(job)


@router.get("/{relatorio_id}")
def get_relatorio(
    relatorio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _to_detail(_get_or_404(db, relatorio_id), db)


@router.patch("/{relatorio_id}")
def atualizar_relatorio(
    relatorio_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Atualiza qualquer campo do relatório (edição inline)."""
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem editar relatórios")
    rel = _get_or_404(db, relatorio_id)
    campos = {
        "titulo", "status", "nivel_alerta", "nivel_alerta_justificativa",
        "temas", "destaques", "alertas", "performance_prefeitura",
        "performance_igor", "tendencias", "recomendacoes", "resumo", "blocos",
    }
    for campo, valor in payload.items():
        if campo in campos:
            setattr(rel, campo, valor)
    db.commit()
    db.refresh(rel)
    return _to_detail(rel, db)


@router.delete("/{relatorio_id}")
def deletar_relatorio(
    relatorio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem deletar relatórios")
    rel = _get_or_404(db, relatorio_id)
    db.delete(rel)
    db.commit()
    return {"ok": True}


# ─── helpers ─────────────────────────────────────────────────────────────────

def _get_or_404(db: Session, rid: int) -> Relatorio:
    r = db.query(Relatorio).filter(Relatorio.id == rid).first()
    if not r:
        raise HTTPException(404, "Relatório não encontrado")
    return r


def _set_report_job(job_id: str, **updates) -> None:
    with _REPORT_JOBS_LOCK:
        job = _REPORT_JOBS.get(job_id)
        if job:
            job.update(updates)


def _run_report_job(job_id: str, d_ini: date, d_fim: date, user_id: int) -> None:
    db = SessionLocal()
    try:
        _set_report_job(job_id, status="running", progress=15, message="Coletando menções, canais oficiais e contexto político.")
        from app.services.relatorio_llm import gerar_relatorio_dados, montar_blocos

        dados = gerar_relatorio_dados(db, d_ini, d_fim)
        _set_report_job(job_id, progress=80, message="Montando briefing editável.")
        rel = Relatorio(
            titulo="Resumo do Dia — Belém",
            periodo_inicio=d_ini,
            periodo_fim=d_fim,
            status="rascunho",
            nivel_alerta=dados.get("nivel_alerta", 3),
            nivel_alerta_justificativa=dados.get("nivel_alerta_justificativa", ""),
            temas=dados.get("temas"),
            destaques=dados.get("destaques"),
            alertas=dados.get("alertas"),
            performance_prefeitura=dados.get("performance_prefeitura"),
            performance_igor=dados.get("performance_igor"),
            tendencias=dados.get("tendencias", {"google": "", "twitter": "", "youtube": ""}),
            recomendacoes=dados.get("recomendacoes"),
            resumo=dados.get("resumo"),
            blocos=montar_blocos(dados),
            gerado_por_llm="qwen",
            usuario_id=user_id,
        )
        db.add(rel)
        db.commit()
        db.refresh(rel)
        _set_report_job(
            job_id,
            status="completed",
            progress=100,
            message="Relatório pronto.",
            relatorio_id=rel.id,
        )
    except Exception as e:
        db.rollback()
        _set_report_job(job_id, status="failed", progress=100, message="Falha na geração.", error=str(e))
    finally:
        db.close()


def _to_list_item(r: Relatorio) -> dict:
    return {
        "id": r.id,
        "titulo": r.titulo,
        "periodo_inicio": r.periodo_inicio.isoformat(),
        "periodo_fim": r.periodo_fim.isoformat(),
        "nivel_alerta": r.nivel_alerta,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _insert_after(blocos: list, after_types: set[str], novos: list[dict]) -> list:
    pos = 0
    for i, bloco in enumerate(blocos):
        if bloco.get("tipo") in after_types:
            pos = i + 1
    return [*blocos[:pos], *novos, *blocos[pos:]]


def _remover_performance_legacy(blocos: list) -> list:
    """Remove seções legadas duplicadas por Canais Oficiais."""
    remover_titulos = {"Performance — Prefeitura", "Performance — Igor Normando"}
    result = []
    i = 0
    while i < len(blocos):
        bloco = blocos[i]
        if (
            bloco.get("tipo") == "divisoria"
            and i + 1 < len(blocos)
            and blocos[i + 1].get("tipo") == "titulo"
            and (blocos[i + 1].get("dados") or {}).get("texto") in remover_titulos
        ):
            i += 2
            while i < len(blocos) and blocos[i].get("tipo") in {"metricas", "grafico", "texto"}:
                i += 1
            continue
        if bloco.get("tipo") == "titulo" and (bloco.get("dados") or {}).get("texto") in remover_titulos:
            i += 1
            while i < len(blocos) and blocos[i].get("tipo") in {"metricas", "grafico", "texto"}:
                i += 1
            continue
        result.append(bloco)
        i += 1
    return result


def _enriquecer_blocos_oficiais(db: Session, r: Relatorio, blocos: list) -> list:
    tipos = {b.get("tipo") for b in blocos}
    if "performance_oficial" in tipos and "top_posts" in tipos:
        return blocos

    from app.services.relatorio_llm import _canais_oficiais_db
    oficiais = _canais_oficiais_db(db, r.periodo_inicio, r.periodo_fim)
    novos = []
    if "performance_oficial" not in tipos and oficiais.get("contas"):
        novos.append({
            "id": uuid.uuid4().hex[:10],
            "tipo": "performance_oficial",
            "dados": {
                "titulo": "Performance dos Canais Oficiais",
                "contas": oficiais.get("contas", []),
            },
        })
    if "top_posts" not in tipos and oficiais.get("top_posts"):
        novos.append({
            "id": uuid.uuid4().hex[:10],
            "tipo": "top_posts",
            "dados": {
                "titulo": "Top Posts Oficiais",
                "posts": oficiais.get("top_posts", [])[:6],
            },
        })
    if not novos:
        return blocos
    return _insert_after(blocos, {"sentimento_painel", "temas_principais"}, novos)


def _to_detail(r: Relatorio, db: Optional[Session] = None) -> dict:
    # Relatórios antigos (sem blocos) são convertidos a partir das colunas
    # estruturadas, para que abram já no editor de blocos.
    blocos = r.blocos
    if not blocos:
        from app.services.relatorio_llm import montar_blocos
        blocos = montar_blocos({
            "temas": r.temas, "destaques": r.destaques, "alertas": r.alertas,
            "performance_prefeitura": r.performance_prefeitura,
            "performance_igor": r.performance_igor,
            "tendencias": r.tendencias, "recomendacoes": r.recomendacoes,
            "resumo": r.resumo,
        })
    blocos = _remover_performance_legacy(blocos)
    if db is not None:
        enriquecidos = _enriquecer_blocos_oficiais(db, r, blocos)
        if enriquecidos != blocos:
            blocos = enriquecidos
            r.blocos = blocos
            db.commit()
            db.refresh(r)
    return {
        **_to_list_item(r),
        "nivel_alerta_justificativa": r.nivel_alerta_justificativa,
        "temas": r.temas,
        "destaques": r.destaques,
        "alertas": r.alertas,
        "performance_prefeitura": r.performance_prefeitura,
        "performance_igor": r.performance_igor,
        "tendencias": r.tendencias,
        "recomendacoes": r.recomendacoes,
        "resumo": r.resumo,
        "blocos": blocos,
        "gerado_por_llm": r.gerado_por_llm,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


# ─── upload de imagem e geração de bloco por IA ──────────────────────────────

@router.post("/upload-imagem")
async def upload_imagem(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Salva uma imagem enviada e retorna a URL pública (/uploads/...)."""
    ext = EXT_IMG.get(file.content_type)
    if not ext:
        raise HTTPException(400, "Formato inválido. Use JPG, PNG, WEBP ou GIF.")
    conteudo = await file.read()
    if len(conteudo) > 8 * 1024 * 1024:
        raise HTTPException(400, "Imagem muito grande (máx 8MB).")
    upload_dir = os.path.join(os.getcwd(), "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    nome = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(upload_dir, nome), "wb") as f:
        f.write(conteudo)
    return {"url": f"/uploads/{nome}"}


@router.post("/{relatorio_id}/gerar-bloco")
def gerar_bloco(
    relatorio_id: int,
    tipo: str = Body(...),
    instrucao: str = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gera o conteúdo de UM bloco via IA, ancorado nos dados do relatório."""
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem gerar conteúdo")
    rel = _get_or_404(db, relatorio_id)
    if not (instrucao or "").strip():
        raise HTTPException(400, "Descreva o que a IA deve gerar neste bloco.")
    from app.services.relatorio_llm import gerar_conteudo_bloco
    try:
        dados = gerar_conteudo_bloco(db, rel, tipo, instrucao.strip())
    except Exception as e:
        raise HTTPException(502, f"Falha na geração via IA: {e}")
    return {"dados": dados}
