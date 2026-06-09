import os
import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.api.v1.deps import get_current_user, get_db
from app.models.user import User, UserRole
from app.models.relatorio import Relatorio

router = APIRouter(prefix="/reports", tags=["reports"])

EXT_IMG = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}


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
    return _to_detail(rel)


@router.get("/{relatorio_id}")
def get_relatorio(
    relatorio_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _to_detail(_get_or_404(db, relatorio_id))


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
    return _to_detail(rel)


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


def _to_detail(r: Relatorio) -> dict:
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
