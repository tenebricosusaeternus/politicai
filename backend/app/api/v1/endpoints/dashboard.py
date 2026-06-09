import logging
import re
from collections import defaultdict
from datetime import date, timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from typing import Optional

from app.api.v1.deps import get_current_user, get_db
from app.models.user import User
from app.models.sentimento_override import SentimentoOverride
from app.models.mencao import Mencao
from app.services.vtracker.client import vtracker, MONITORAMENTOS, NOMES
from app.services.llm_sentiment import classificar_sentimento, extrair_temas_llm

logger = logging.getLogger(__name__)

STOPWORDS_PT = {
    "o","a","os","as","um","uma","uns","umas",
    "de","do","da","dos","das","em","no","na","nos","nas",
    "por","pelo","pela","pelos","pelas","para","com","sem","sob","sobre",
    "entre","até","após","desde","ante","perante","contra","durante",
    "e","ou","mas","porém","contudo","todavia","entretanto",
    "porque","pois","que","se","como","quando","onde","embora","enquanto",
    "eu","tu","ele","ela","nós","vós","eles","elas",
    "me","te","se","nos","vos","lhe","lhes",
    "meu","minha","meus","minhas","seu","sua","seus","suas",
    "nosso","nossa","nossos","nossas",
    "este","esta","estes","estas","esse","essa","esses","essas",
    "aquele","aquela","aqueles","aquelas","isso","isto","aquilo",
    "qual","quais","quem","cujo","cuja","cujos","cujas",
    "dele","dela","deles","delas","nele","nela","neles","nelas",
    "desse","dessa","nesses","nessa","deste","desta","neste","nesta",
    "é","são","era","eram","foi","foram","ser","estar","ter","há",
    "vai","vão","ir","tem","têm","tinha","tinham","tive","teve","tiver",
    "pode","podem","deve","devem","quer","querem","faz","fazem","fazer",
    "não","sim","já","ainda","também","sempre","nunca","jamais",
    "muito","pouco","mais","menos","tudo","nada","algo","tanto","quanto",
    "aqui","ali","lá","aí","hoje","ontem","amanhã","agora","depois","antes",
    "só","apenas","bem","mal","assim","então","logo","talvez","certamente",
    "rt","via","pra","pro","pros","pras","tá","né","vc","vcs",
    "vs","ex","etc","sr","sra","dr","dra","http","https","www",
    "ao","aos","à","às","num","numa","nuns","numas",
    "foi","fui","fez","deu","dá","dão","dar","ver","viu",
    "oi","olá","boa","bom","ótima","ótimo","ok","ops",
    "aqui","isso","este","essa","esse","aquele","aquela",
    "igor","normando",
}


def _tokenizar(texto: str) -> list:
    texto = texto.lower()
    texto = re.sub(r'https?://\S+', ' ', texto)
    texto = re.sub(r'@\w+', ' ', texto)
    texto = re.sub(r'#(\w+)', r' \1 ', texto)
    texto = re.sub(r'[^\w\sáàãâéèêíìîóòõôúùûç]', ' ', texto)
    tokens = texto.split()
    return [t for t in tokens if len(t) >= 4 and not t.isdigit() and t not in STOPWORDS_PT]


router = APIRouter(prefix="/dashboard", tags=["dashboard"])

SENTIMENTOS_VALIDOS = {"POSITIVA", "NEGATIVA", "NEUTRA", "SEM_QUALIFICACAO", "IRRELEVANTE"}


# ─── helpers ─────────────────────────────────────────────────────────────────

def _load_overrides(db: Session, ids: list) -> dict:
    if not ids:
        return {}
    rows = db.query(SentimentoOverride).filter(
        SentimentoOverride.ocorrencia_id.in_(ids)
    ).all()
    return {r.ocorrencia_id: r for r in rows}


def _sentimento_final(m: Mencao, overrides: dict) -> str:
    """
    Prioridade de sentimento:
    1. Correção manual humana  (override.source = 'manual')
    2. Classificação LLM local (mencao.sentimento_llm)
    3. PENDENTE enquanto a LLM ainda não tratou
    """
    ov = overrides.get(m.id)
    if ov:
        return ov.sentimento_corrigido
    if m.sentimento_llm:
        return m.sentimento_llm
    return "PENDENTE"


def _mencao_para_dict(m: Mencao, overrides: dict) -> dict:
    ov = overrides.get(m.id)
    sentimento = _sentimento_final(m, overrides)
    return {
        "id": m.id,
        "monitoramento_id": m.monitoramento_id,
        "texto": m.texto or "",
        "link": m.link or "",
        "data": m.data.isoformat() if m.data else None,
        "plataforma": m.plataforma or "",
        "publicador_nome": m.publicador_nome or "",
        "publicador_link": m.publicador_link or "",
        "sentimento": sentimento,
        "sentimento_vtracker": m.sentimento_vtracker or "",
        "sentimento_llm": m.sentimento_llm or "",
        "corrigido": ov is not None,
        "source": ov.source if ov else ("llm_auto" if m.sentimento_llm else None),
        "observacao_correcao": ov.observacao if ov else None,
        "likes": m.likes or 0,
        "shares": m.shares or 0,
        "comentarios": m.comentarios or 0,
        "tipo_conteudo": m.tipo_conteudo or "",
        "thumbnail": m.thumbnail or "",
        "localizacao": m.localizacao or "",
    }


def _base_query(
    db: Session,
    monitoramento: str,
    d_inicio: date,
    d_fim: date,
    somente_processadas: bool = True,
):
    """Query base filtrada por monitor/período; por padrão só expõe menções higienizadas pela LLM."""
    d_ini_dt = datetime.combine(d_inicio, datetime.min.time())
    d_fim_dt = datetime.combine(d_fim + timedelta(days=1), datetime.min.time())
    q = db.query(Mencao).filter(
        Mencao.data >= d_ini_dt,
        Mencao.data < d_fim_dt,
    )
    if monitoramento != "todos" and monitoramento in MONITORAMENTOS:
        q = q.filter(Mencao.monitoramento_id == MONITORAMENTOS[monitoramento])
    if somente_processadas:
        q = q.filter(Mencao.llm_processado == True)  # noqa: E712
    return q


def _dedup_por_link(mencoes: list) -> list:
    """Remove duplicatas pelo campo link (mesmo post em múltiplos monitores)."""
    seen: set = set()
    result = []
    for m in mencoes:
        key = (m.link or "").strip()
        if not key:
            key = f"{m.plataforma}|{m.publicador_nome}|{(m.data.date() if m.data else '')}|{(m.texto or '')[:80]}"
        if key not in seen:
            seen.add(key)
            result.append(m)
    return result


def _parse_num(valor) -> int:
    if valor is None:
        return 0
    if isinstance(valor, (int, float)):
        return int(valor)
    s = str(valor).strip()
    if s in ("", "-", "—"):
        return 0
    try:
        return int(float(s.replace(".", "").replace(",", ".")))
    except Exception:
        return 0


def _header_total(header_map: dict, metric_key: str, value_key: str = "header.total") -> int:
    dados = (header_map or {}).get(metric_key) or {}
    valores = dados.get("nomeValores") or {}
    return _parse_num(valores.get(value_key))


def _header_value(header_map: dict, metric_key: str, value_key: str) -> int:
    dados = (header_map or {}).get(metric_key) or {}
    valores = dados.get("nomeValores") or {}
    return _parse_num(valores.get(value_key))


def _metric_latest(metricas_por_data: dict) -> dict:
    if not metricas_por_data:
        return {}
    datas = sorted(metricas_por_data.keys())
    latest = metricas_por_data.get(datas[-1]) or {}
    result = {}
    for nome, valor in latest.items():
        result[nome] = _parse_num(valor.get("valor") if isinstance(valor, dict) else valor)
    return result


def _metric_any(metricas: dict, *nomes: str) -> int:
    return max((_parse_num(metricas.get(nome)) for nome in nomes), default=0)


def _variacao(atual: int, anterior: int) -> dict:
    pct = None if anterior == 0 else round((atual - anterior) / anterior * 100, 1)
    return {"atual": atual, "anterior": anterior, "delta": atual - anterior, "pct": pct}


def _normalizar_insight_item(item: dict) -> dict:
    conta = item.get("conta") or {}
    cabecalho = item.get("cabecalho") or {}
    perfil_header = ((cabecalho.get("perfilHeader") or {}).get("headerMap") or {})
    post_header = ((cabecalho.get("postHeader") or {}).get("headerMap") or {})
    posts_raw = item.get("posts") or {}
    rede = conta.get("rede") or item.get("tipoRede") or ""

    is_instagram = "Instagram" in rede
    is_facebook = "Facebook" in rede

    seguidores = (
        _header_value(perfil_header, "header.total_followers_count", "header.total")
        or _header_value(perfil_header, "header.total_followers_count", "header.maximo__04/06/26")
        or _header_value(perfil_header, "header.total_followers_count", "header.maximo")
    )
    # O V-Tracker coloca datas dentro do nome da chave; para seguidores no
    # Instagram pegamos o maior valor disponível quando a chave exata varia.
    if not seguidores:
        vals = ((perfil_header.get("header.total_followers_count") or {}).get("nomeValores") or {})
        seguidores = max((_parse_num(v) for k, v in vals.items() if "maximo" in k or "total" in k), default=0)

    perfil = {
        "seguidores": seguidores,
        "saldo_seguidores": _header_value(perfil_header, "header.total_followers_count", "header.saldo"),
        "alcance": max(
            _header_value(perfil_header, "header.reach", "header.saldo"),
            max((
                _parse_num(v)
                for k, v in ((perfil_header.get("header.reach") or {}).get("nomeValores") or {}).items()
                if "maximo" in k or "total" in k
            ), default=0),
        ),
        "impressoes": _header_value(
            perfil_header,
            "header.page_posts_impressions_posts",
            "header.page_posts_impressions",
        ),
        "impressoes_organicas": _header_value(
            perfil_header,
            "header.page_posts_impressions_posts",
            "header.page_posts_impressions_organic",
        ),
        "follows": _header_value(
            perfil_header,
            "header.page_daily_follows",
            "header.page_daily_follows_unique",
        ),
        "unfollows": _header_value(
            perfil_header,
            "header.page_daily_follows",
            "header.page_daily_unfollows_unique",
        ),
        "views": _header_value(
            perfil_header,
            "header.page_views_total_title",
            "header.page_views_total",
        ),
    }

    postagens = {
        "total_posts": len(posts_raw),
        "likes": _header_total(post_header, "likes") or _header_total(post_header, "like"),
        "comentarios": _header_total(post_header, "comments"),
        "compartilhamentos": _header_total(post_header, "shares"),
        "salvos": _header_total(post_header, "saved"),
        "love": _header_total(post_header, "love"),
        "haha": _header_total(post_header, "haha"),
        "wow": _header_total(post_header, "wow"),
        "sad": _header_total(post_header, "sad"),
        "angry": _header_total(post_header, "angry"),
    }
    postagens["engajamento_total"] = sum(postagens[k] for k in (
        "likes", "comentarios", "compartilhamentos", "salvos",
        "love", "haha", "wow", "sad", "angry",
    ))

    top_posts = []
    for raw in posts_raw.values():
        post = raw.get("post") or {}
        metricas = _metric_latest(raw.get("metricas_por_data") or {})
        likes = _metric_any(metricas, "likes", "like")
        comentarios = _metric_any(metricas, "comments")
        compartilhamentos = _metric_any(metricas, "shares")
        salvos = _metric_any(metricas, "saved")
        reactions = sum(_metric_any(metricas, k) for k in ("love", "haha", "wow", "sad", "angry"))
        engajamento = likes + comentarios + compartilhamentos + salvos + reactions
        top_posts.append({
            "id": post.get("hash") or "",
            "data": post.get("dataFormatada") or "",
            "tipo": post.get("tipoConteudo") or "",
            "texto": re.sub(r"\s+", " ", (post.get("descricao") or "")).strip(),
            "link": post.get("link") or "",
            "thumbnail": post.get("thumbnail") or post.get("fullPicture") or "",
            "likes": likes,
            "comentarios": comentarios,
            "compartilhamentos": compartilhamentos,
            "salvos": salvos,
            "reacoes": reactions,
            "engajamento": engajamento,
        })
    top_posts.sort(key=lambda p: p["engajamento"], reverse=True)

    return {
        "id": conta.get("id"),
        "nome": conta.get("nome") or "",
        "rede": "Instagram" if is_instagram else "Facebook" if is_facebook else rede,
        "imagem": conta.get("imagemPerfil") or item.get("imagemPerfil") or "",
        "perfil": perfil,
        "postagens": postagens,
        "crescimento": None,
        "top_posts": top_posts[:8],
    }


def _aplicar_crescimento_insights(atual: dict, anterior: Optional[dict]) -> dict:
    if not anterior:
        atual["crescimento"] = {
            "seguidores": _variacao(atual["perfil"].get("seguidores", 0), 0),
            "alcance_ou_impressoes": _variacao(
                max(atual["perfil"].get("alcance", 0), atual["perfil"].get("impressoes", 0)),
                0,
            ),
            "engajamento": _variacao(atual["postagens"].get("engajamento_total", 0), 0),
            "posts": _variacao(atual["postagens"].get("total_posts", 0), 0),
        }
        return atual

    atual["crescimento"] = {
        "seguidores": _variacao(
            atual["perfil"].get("seguidores", 0),
            anterior["perfil"].get("seguidores", 0),
        ),
        "alcance_ou_impressoes": _variacao(
            max(atual["perfil"].get("alcance", 0), atual["perfil"].get("impressoes", 0)),
            max(anterior["perfil"].get("alcance", 0), anterior["perfil"].get("impressoes", 0)),
        ),
        "engajamento": _variacao(
            atual["postagens"].get("engajamento_total", 0),
            anterior["postagens"].get("engajamento_total", 0),
        ),
        "posts": _variacao(
            atual["postagens"].get("total_posts", 0),
            anterior["postagens"].get("total_posts", 0),
        ),
    }
    return atual


# ─── agregados (banco local) ─────────────────────────────────────────────────
# Todos os agregados são calculados a partir da tabela `mencoes` no banco.
# O dashboard NÃO depende da API do V-Tracker em tempo de request — os dados
# são populados pelo job de sync. Cada resposta inclui `ultima_sincronizacao`.

def _ultima_sync_iso(db: Session) -> Optional[str]:
    from app.models.sync_state import SyncState
    estado = db.query(SyncState).filter(SyncState.id == 1).first()
    if estado and estado.ultima_sincronizacao:
        return estado.ultima_sincronizacao.isoformat()
    ultima = db.query(sqlfunc.max(Mencao.atualizado_em)).scalar()
    return ultima.isoformat() if ultima else None


def _resumo_db(db: Session, monitoramento: str, d_inicio: date, d_fim: date) -> dict:
    """Agrega sentimentos/engajamento do banco no formato do resumo do V-Tracker."""
    mencoes = _dedup_por_link(_base_query(db, monitoramento, d_inicio, d_fim).all())
    overrides = _load_overrides(db, [m.id for m in mencoes])

    positivas = negativas = neutras = sem_q = 0
    engajamento = 0
    publicadores: set = set()
    for m in mencoes:
        s = _sentimento_final(m, overrides)
        if s == "IRRELEVANTE":
            continue
        if s == "POSITIVA":
            positivas += 1
        elif s == "NEGATIVA":
            negativas += 1
        elif s == "NEUTRA":
            neutras += 1
        else:
            sem_q += 1
        engajamento += (m.likes or 0) + (m.shares or 0) + (m.comentarios or 0)
        if m.publicador_nome:
            publicadores.add(m.publicador_nome)

    total = positivas + negativas + neutras + sem_q
    mid = MONITORAMENTOS.get(monitoramento, 0)
    return {
        "monitoramento_id": mid,
        "nome": NOMES.get(mid, "Todos" if monitoramento == "todos" else monitoramento),
        "periodo": f"{d_inicio.isoformat()} a {d_fim.isoformat()}",
        "total": total,
        "positivas": positivas,
        "neutras": neutras,
        "negativas": negativas,
        "sem_qualificacao": sem_q,
        "score_sentimento": round((positivas - negativas) / total, 4) if total else 0,
        "impressoes": engajamento,
        "engajamento": engajamento,
        "pessoas_alcancadas": engajamento,
        "publicadores": len(publicadores),
    }


@router.get("/sentimentos")
def get_sentimentos(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if monitoramento != "todos" and monitoramento not in MONITORAMENTOS:
        raise HTTPException(400, f"Monitoramento inválido. Use: {list(MONITORAMENTOS.keys()) + ['todos']}")
    hoje = date.today()
    d_inicio = data_inicio or hoje
    d_fim = data_fim or hoje
    r = _resumo_db(db, monitoramento, d_inicio, d_fim)
    r["ultima_sincronizacao"] = _ultima_sync_iso(db)
    return r


@router.get("/todos-monitoramentos")
def get_todos_monitoramentos(
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoje = date.today()
    d_inicio = data_inicio or hoje
    d_fim = data_fim or hoje
    resultados = []
    for nome in MONITORAMENTOS:
        r = _resumo_db(db, nome, d_inicio, d_fim)
        r["slug"] = nome
        resultados.append(r)
    return resultados


@router.get("/serie-temporal")
def get_serie_temporal(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if monitoramento != "todos" and monitoramento not in MONITORAMENTOS:
        raise HTTPException(400, f"Monitoramento inválido. Use: {list(MONITORAMENTOS.keys()) + ['todos']}")
    hoje = date.today()
    fim = data_fim or hoje
    inicio = data_inicio or hoje
    delta = (fim - inicio).days + 1
    if delta < 7:
        inicio = fim - timedelta(days=6)
    serie = []
    dia = inicio
    while dia <= fim:
        r = _resumo_db(db, monitoramento, dia, dia)
        serie.append({
            "data": dia.isoformat(),
            "total": r["total"],
            "positivas": r["positivas"],
            "neutras": r["neutras"],
            "negativas": r["negativas"],
            "sem_qualificacao": r["sem_qualificacao"],
            "impressoes": r["impressoes"],
            "engajamento": r["engajamento"],
        })
        dia += timedelta(days=1)
    return {
        "monitoramento": monitoramento,
        "serie": serie,
        "ultima_sincronizacao": _ultima_sync_iso(db),
    }


@router.get("/velocidade")
def get_velocidade(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if monitoramento != "todos" and monitoramento not in MONITORAMENTOS:
        raise HTTPException(400, f"Monitoramento inválido. Use: {list(MONITORAMENTOS.keys()) + ['todos']}")
    hoje = date.today()
    fim = data_fim or hoje
    inicio = data_inicio or hoje
    delta = (fim - inicio).days + 1
    ant_fim = inicio - timedelta(days=1)
    ant_inicio = ant_fim - timedelta(days=delta - 1)

    def pct(atual, anterior):
        if anterior == 0:
            return None
        return round((atual - anterior) / anterior * 100, 1)

    atual = _resumo_db(db, monitoramento, inicio, fim)
    anterior = _resumo_db(db, monitoramento, ant_inicio, ant_fim)

    return {
        "ultima_sincronizacao": _ultima_sync_iso(db),
        "periodo_atual": {
            "inicio": inicio.isoformat(), "fim": fim.isoformat(),
            "total": atual["total"], "positivas": atual["positivas"],
            "negativas": atual["negativas"], "neutras": atual["neutras"],
            "score_sentimento": round(atual.get("score_sentimento", 0) * 100, 1),
        },
        "periodo_anterior": {
            "inicio": ant_inicio.isoformat(), "fim": ant_fim.isoformat(),
            "total": anterior["total"], "positivas": anterior["positivas"],
            "negativas": anterior["negativas"], "neutras": anterior["neutras"],
            "score_sentimento": round(anterior.get("score_sentimento", 0) * 100, 1),
        },
        "variacao_total_pct": pct(atual["total"], anterior["total"]),
        "variacao_positivas_pct": pct(atual["positivas"], anterior["positivas"]),
        "variacao_negativas_pct": pct(atual["negativas"], anterior["negativas"]),
        "variacao_score_pts": round(
            atual.get("score_sentimento", 0) * 100 - anterior.get("score_sentimento", 0) * 100, 1
        ),
    }


# ─── endpoints de conteúdo (banco local) ─────────────────────────────────────

@router.get("/sync/status")
def get_sync_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Status do banco local: total de menções, pendentes LLM, última sincronização."""
    from app.services.sync import status_banco
    return status_banco(db)


@router.get("/insights/oficiais")
def get_insights_oficiais(
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Métricas dos canais oficiais do Igor Normando no painel Insights do V-Tracker.
    Retorna Facebook/Instagram normalizados para gráficos do dashboard.
    """
    hoje = date.today()
    d_fim = data_fim or hoje
    d_inicio = data_inicio or (d_fim - timedelta(days=6))
    delta_dias = max(1, (d_fim - d_inicio).days + 1)
    ant_fim = d_inicio - timedelta(days=1)
    ant_inicio = ant_fim - timedelta(days=delta_dias - 1)

    from app.services.official_insights import get_official_insights_local
    return get_official_insights_local(db, d_inicio, d_fim)


@router.post("/insights/sync")
def trigger_insights_sync(
    dias: int = Query(7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models.user import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem sincronizar Insights")
    from app.services.official_insights import sync_official_insights_recente
    try:
        return {"ok": True, **sync_official_insights_recente(db, dias=dias)}
    except Exception as e:
        logger.exception("Falha ao sincronizar Insights V-Tracker")
        raise HTTPException(502, f"Falha ao sincronizar Insights V-Tracker: {e}")


@router.post("/sync")
def trigger_sync(
    dias: int = Query(7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dispara sync manual do V-Tracker para o banco local."""
    from app.models.user import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem disparar o sync")
    from app.services.sync import sincronizar_recente
    from app.services.official_insights import sync_official_insights_recente
    result = sincronizar_recente(db, dias=dias)
    try:
        result["insights"] = sync_official_insights_recente(db, dias=7)
    except Exception as e:
        logger.warning("Sync de Insights falhou: %s", e)
        result["insights"] = {"erro": str(e)}
    return {"ok": True, **result}


@router.post("/sync/classificar")
def trigger_classificar(
    limite: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Classifica com LLM as menções pendentes no banco."""
    from app.models.user import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem disparar a classificação")
    from app.services.sync import classificar_todos_pendentes
    n = classificar_todos_pendentes(db, max_total=limite)
    return {"ok": True, "classificadas": n}


@router.get("/vtracker/token/status")
def vtracker_token_status(
    current_user: User = Depends(get_current_user),
):
    """Estado do token V-Tracker: válido, expirado e quando expira."""
    import json as _json, base64 as _b64
    tok = vtracker._token or ""
    info = {"configurado": bool(tok), "expirado": vtracker.token_expirado()}
    try:
        p = tok.split(".")[1]; p += "=" * (-len(p) % 4)
        d = _json.loads(_b64.urlsafe_b64decode(p))
        info["expira_em"] = datetime.fromtimestamp(d["exp"]).isoformat() if d.get("exp") else None
        info["email"] = d.get("email")
        info["empresa"] = d.get("empresa")
    except Exception:
        pass
    return info


@router.post("/vtracker/token")
def atualizar_vtracker_token(
    token: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
):
    """
    Atualiza o JWT do V-Tracker em tempo real (sem reiniciar o servidor) e
    persiste em VTRACKER_TOKEN no .env. Renove em app.vtracker.com.br
    (F12 > Network > copie o header Authorization, sem o 'Bearer ').
    """
    from app.models.user import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem atualizar o token")

    import json as _json, base64 as _b64, os, re as _re
    token = token.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    # Valida formato JWT e expiração futura
    try:
        p = token.split(".")[1]; p += "=" * (-len(p) % 4)
        payload = _json.loads(_b64.urlsafe_b64decode(p))
    except Exception:
        raise HTTPException(400, "Token inválido: não é um JWT válido")
    exp = payload.get("exp")
    if exp and datetime.now().timestamp() >= exp:
        raise HTTPException(400, "Esse token já está expirado. Copie um token recém-gerado.")

    # Aplica em memória
    vtracker.set_token(token)

    # Persiste no .env (substitui ou adiciona a linha VTRACKER_TOKEN)
    env_path = os.path.join(os.getcwd(), ".env")
    try:
        linhas = []
        achou = False
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                for ln in f:
                    if _re.match(r"\s*VTRACKER_TOKEN\s*=", ln):
                        linhas.append(f"VTRACKER_TOKEN={token}\n"); achou = True
                    else:
                        linhas.append(ln)
        if not achou:
            if linhas and not linhas[-1].endswith("\n"):
                linhas[-1] += "\n"
            linhas.append(f"VTRACKER_TOKEN={token}\n")
        with open(env_path, "w") as f:
            f.writelines(linhas)
        persistido = True
    except Exception as e:
        logging.warning("Não persistiu token no .env: %s", e)
        persistido = False

    return {
        "ok": True,
        "persistido_env": persistido,
        "expira_em": datetime.fromtimestamp(exp).isoformat() if exp else None,
        "email": payload.get("email"),
        "empresa": payload.get("empresa"),
    }


@router.get("/mencoes-recentes")
def get_mencoes_recentes(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    pagina: int = Query(0, ge=0),
    tamanho: int = Query(20, ge=1, le=100),
    incluir_irrelevantes: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoje = date.today()
    d_inicio = data_inicio or hoje
    d_fim = data_fim or hoje

    # Valida monitoramento
    if monitoramento != "todos" and monitoramento not in MONITORAMENTOS:
        raise HTTPException(400, f"Monitoramento inválido. Use: {list(MONITORAMENTOS.keys())} ou 'todos'")

    q = _base_query(db, monitoramento, d_inicio, d_fim)

    # Busca tudo para deduplica por link, depois pagina localmente
    todas = q.order_by(Mencao.data.desc()).all()
    unicas = _dedup_por_link(todas)

    ids = [m.id for m in unicas]
    overrides = _load_overrides(db, ids)
    if not incluir_irrelevantes:
        unicas = [m for m in unicas if _sentimento_final(m, overrides) != "IRRELEVANTE"]

    total = len(unicas)
    total_paginas = max(1, (total + tamanho - 1) // tamanho)
    pagina_safe = min(pagina, total_paginas - 1)
    start = pagina_safe * tamanho
    fim_slice = start + tamanho

    items = [_mencao_para_dict(m, overrides) for m in unicas[start:fim_slice]]

    return {
        "total": total,
        "paginas": total_paginas,
        "pagina": pagina_safe,
        "items": items,
    }


# ─── override de sentimento ──────────────────────────────────────────────────

@router.post("/mencoes/{ocorrencia_id}/sentimento")
def corrigir_sentimento(
    ocorrencia_id: int,
    sentimento: str = Body(..., embed=True),
    observacao: str = Body("", embed=True),
    monitoramento_id: int = Body(..., embed=True),
    texto_snapshot: str = Body("", embed=True),
    plataforma: str = Body("", embed=True),
    publicador_nome: str = Body("", embed=True),
    sentimento_vtracker: str = Body("NEUTRA", embed=True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if sentimento not in SENTIMENTOS_VALIDOS:
        raise HTTPException(400, f"Sentimento inválido. Use: {SENTIMENTOS_VALIDOS}")

    override = db.query(SentimentoOverride).filter(
        SentimentoOverride.ocorrencia_id == ocorrencia_id
    ).first()

    if override:
        override.sentimento_corrigido = sentimento
        override.observacao = observacao or override.observacao
        override.source = "manual"
        override.usuario_id = current_user.id
        override.updated_at = datetime.utcnow()
    else:
        override = SentimentoOverride(
            ocorrencia_id=ocorrencia_id,
            monitoramento_id=monitoramento_id,
            texto_snapshot=texto_snapshot,
            plataforma=plataforma,
            publicador_nome=publicador_nome,
            sentimento_vtracker=sentimento_vtracker,
            sentimento_corrigido=sentimento,
            observacao=observacao,
            source="manual",
            usuario_id=current_user.id,
        )
        db.add(override)

    db.commit()
    return {"ok": True, "ocorrencia_id": ocorrencia_id, "sentimento": sentimento}


@router.delete("/mencoes/{ocorrencia_id}/sentimento")
def remover_correcao(
    ocorrencia_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    override = db.query(SentimentoOverride).filter(
        SentimentoOverride.ocorrencia_id == ocorrencia_id
    ).first()
    if not override:
        raise HTTPException(404, "Nenhuma correção encontrada para esta menção")
    db.delete(override)
    db.commit()
    return {"ok": True, "ocorrencia_id": ocorrencia_id}


@router.get("/correcoes")
def listar_correcoes(
    monitoramento_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(SentimentoOverride)
    if monitoramento_id:
        q = q.filter(SentimentoOverride.monitoramento_id == monitoramento_id)
    rows = q.order_by(SentimentoOverride.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "ocorrencia_id": r.ocorrencia_id,
            "monitoramento_id": r.monitoramento_id,
            "texto": r.texto_snapshot,
            "plataforma": r.plataforma,
            "publicador_nome": r.publicador_nome,
            "sentimento_vtracker": r.sentimento_vtracker,
            "sentimento_corrigido": r.sentimento_corrigido,
            "observacao": r.observacao,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# ─── principais temas ────────────────────────────────────────────────────────

@router.get("/temas")
def get_temas(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoje = date.today()
    d_inicio = data_inicio or hoje
    d_fim = data_fim or hoje

    q = _base_query(db, monitoramento, d_inicio, d_fim, somente_processadas=False)
    mencoes = q.order_by(Mencao.data.desc()).limit(200).all()
    ids = [m.id for m in mencoes]
    overrides = _load_overrides(db, ids)

    # Filtra irrelevantes; passa texto + sentimento para o LLM
    para_llm = []
    for m in mencoes:
        s = _sentimento_final(m, overrides)
        if s == "IRRELEVANTE":
            continue
        para_llm.append({"texto": m.texto or "", "sentimento": s})

    temas = extrair_temas_llm(para_llm)
    return {"mencoes_analisadas": len(para_llm), "temas": temas}


# ─── nuvem de palavras ───────────────────────────────────────────────────────

@router.get("/nuvem-palavras")
def get_nuvem_palavras(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    top: int = Query(80, ge=20, le=150),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoje = date.today()
    d_inicio = data_inicio or hoje
    d_fim = data_fim or hoje

    q = _base_query(db, monitoramento, d_inicio, d_fim)
    mencoes = q.order_by(Mencao.data.desc()).limit(500).all()
    ids = [m.id for m in mencoes]
    overrides = _load_overrides(db, ids)

    freq: dict = defaultdict(lambda: {"total": 0, "POSITIVA": 0, "NEGATIVA": 0, "NEUTRA": 0, "SEM_QUALIFICACAO": 0})
    total_mencoes = 0

    for m in mencoes:
        s = _sentimento_final(m, overrides)
        if s == "IRRELEVANTE":
            continue
        total_mencoes += 1
        s = s if s in ("POSITIVA", "NEGATIVA", "NEUTRA", "SEM_QUALIFICACAO") else "NEUTRA"
        for token in set(_tokenizar(m.texto or "")):
            freq[token]["total"] += 1
            freq[token][s] += 1

    palavras = []
    for texto, counts in freq.items():
        total = counts["total"]
        sent_counts = {k: counts[k] for k in ("POSITIVA", "NEGATIVA", "NEUTRA", "SEM_QUALIFICACAO")}
        sentimento = max(sent_counts, key=lambda k: sent_counts[k])
        palavras.append({
            "texto": texto,
            "frequencia": total,
            "sentimento": sentimento,
            "positivas": counts["POSITIVA"],
            "negativas": counts["NEGATIVA"],
            "neutras": counts["NEUTRA"],
        })

    palavras.sort(key=lambda x: x["frequencia"], reverse=True)
    return {"total_mencoes": total_mencoes, "palavras": palavras[:top]}


# ─── análise: publicadores ────────────────────────────────────────────────────

@router.get("/publicadores")
def get_publicadores(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    top: int = Query(15, ge=5, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoje = date.today()
    d_inicio = data_inicio or hoje
    d_fim = data_fim or hoje

    q = _base_query(db, monitoramento, d_inicio, d_fim)
    mencoes = _dedup_por_link(q.order_by(Mencao.data.desc()).all())
    ids = [m.id for m in mencoes]
    overrides = _load_overrides(db, ids)

    agg: dict = defaultdict(lambda: {
        "total": 0, "POSITIVA": 0, "NEGATIVA": 0, "NEUTRA": 0, "SEM_QUALIFICACAO": 0,
        "engajamento": 0, "link": "", "plataformas": set(),
    })

    for m in mencoes:
        s = _sentimento_final(m, overrides)
        if s == "IRRELEVANTE":
            continue
        nome = (m.publicador_nome or "").strip() or "(sem nome)"
        s_key = s if s in SENTIMENTOS_VALIDOS else "NEUTRA"
        eng = (m.likes or 0) + (m.shares or 0) + (m.comentarios or 0)
        agg[nome]["total"] += 1
        agg[nome][s_key] += 1
        agg[nome]["engajamento"] += eng
        if m.publicador_link:
            agg[nome]["link"] = m.publicador_link
        if m.plataforma:
            agg[nome]["plataformas"].add(m.plataforma)

    resultado = []
    for nome, d in agg.items():
        total = d["total"]
        score = round((d["POSITIVA"] - d["NEGATIVA"]) / total * 100) if total else 0
        resultado.append({
            "nome": nome,
            "link": d["link"],
            "total": total,
            "positivas": d["POSITIVA"],
            "negativas": d["NEGATIVA"],
            "neutras": d["NEUTRA"],
            "sem_qualificacao": d["SEM_QUALIFICACAO"],
            "score_sentimento": score,
            "engajamento": d["engajamento"],
            "plataformas": sorted(d["plataformas"]),
        })

    resultado.sort(key=lambda x: x["total"], reverse=True)
    total_mencoes = sum(d["total"] for d in agg.values())
    return {"mencoes_analisadas": total_mencoes, "publicadores": resultado[:top]}


# ─── análise: plataformas ─────────────────────────────────────────────────────

@router.get("/plataformas")
def get_plataformas(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    hoje = date.today()
    d_inicio = data_inicio or hoje
    d_fim = data_fim or hoje

    q = _base_query(db, monitoramento, d_inicio, d_fim)
    mencoes = _dedup_por_link(q.order_by(Mencao.data.desc()).all())
    ids = [m.id for m in mencoes]
    overrides = _load_overrides(db, ids)

    agg: dict = defaultdict(lambda: {
        "total": 0, "POSITIVA": 0, "NEGATIVA": 0, "NEUTRA": 0, "SEM_QUALIFICACAO": 0, "engajamento": 0,
    })

    for m in mencoes:
        s = _sentimento_final(m, overrides)
        if s == "IRRELEVANTE":
            continue
        nome = (m.plataforma or "").strip() or "Outros"
        s_key = s if s in SENTIMENTOS_VALIDOS else "NEUTRA"
        eng = (m.likes or 0) + (m.shares or 0) + (m.comentarios or 0)
        agg[nome]["total"] += 1
        agg[nome][s_key] += 1
        agg[nome]["engajamento"] += eng

    resultado = []
    for nome, d in agg.items():
        total = d["total"]
        score = round((d["POSITIVA"] - d["NEGATIVA"]) / total * 100) if total else 0
        resultado.append({
            "nome": nome,
            "total": total,
            "positivas": d["POSITIVA"],
            "negativas": d["NEGATIVA"],
            "neutras": d["NEUTRA"],
            "sem_qualificacao": d["SEM_QUALIFICACAO"],
            "score_sentimento": score,
            "engajamento_total": d["engajamento"],
            "impressoes_estimadas": d["engajamento"] * 5,
        })

    resultado.sort(key=lambda x: x["total"], reverse=True)
    total_mencoes = sum(d["total"] for d in agg.values())
    return {"mencoes_analisadas": total_mencoes, "plataformas": resultado}


# ─── análise: heatmap ────────────────────────────────────────────────────────

@router.get("/heatmap")
def get_heatmap(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    modo: str = Query("volume"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if modo not in ("volume", "sentimento"):
        raise HTTPException(400, "modo deve ser 'volume' ou 'sentimento'")
    hoje = date.today()
    d_inicio = data_inicio or hoje
    d_fim = data_fim or hoje

    q = _base_query(db, monitoramento, d_inicio, d_fim)
    mencoes = q.filter(Mencao.data.isnot(None)).all()
    ids = [m.id for m in mencoes]
    overrides = _load_overrides(db, ids)

    matriz_raw = [[{"count": 0, "score_sum": 0} for _ in range(24)] for _ in range(7)]
    total_mencoes = 0

    for m in mencoes:
        s = _sentimento_final(m, overrides)
        if s == "IRRELEVANTE":
            continue
        total_mencoes += 1
        wd = m.data.weekday()
        hr = m.data.hour
        score = 100 if s == "POSITIVA" else -100 if s == "NEGATIVA" else 0
        matriz_raw[wd][hr]["count"] += 1
        matriz_raw[wd][hr]["score_sum"] += score

    if modo == "volume":
        matriz = [[c["count"] for c in linha] for linha in matriz_raw]
    else:
        matriz = [
            [round(c["score_sum"] / c["count"]) if c["count"] > 0 else None for c in linha]
            for linha in matriz_raw
        ]

    return {
        "mencoes_analisadas": total_mencoes,
        "modo": modo,
        "dias_semana": ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
        "horas": list(range(24)),
        "matriz": matriz,
    }


# ─── reclassificação manual via LLM ─────────────────────────────────────────
# (usa o banco local — classifica mencoes.sentimento_llm)

@router.post("/reclassificar")
def reclassificar_mencoes(
    monitoramento: str = Query("todos"),
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reclassifica menções do banco via Qwen. Não sobrescreve correções manuais."""
    from app.models.user import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem reclassificar")

    hoje = date.today()
    d_inicio = data_inicio or hoje
    d_fim = data_fim or hoje

    q = _base_query(db, monitoramento, d_inicio, d_fim)
    mencoes = q.all()

    ids = [m.id for m in mencoes]
    overrides = _load_overrides(db, ids)

    atualizadas = 0
    for m in mencoes:
        ov = overrides.get(m.id)
        if ov and ov.source == "manual":
            continue  # não sobrescreve correção humana
        novo_sent = classificar_sentimento(m.texto or m.titulo or "")
        m.sentimento_llm = novo_sent
        m.llm_processado = True
        atualizadas += 1

    db.commit()
    return {
        "ok": True,
        "processadas": len(mencoes),
        "atualizadas": atualizadas,
        "mensagem": f"{atualizadas} menções reclassificadas pelo Qwen",
    }


@router.post("/limpar-reclassificar")
def limpar_reclassificar(
    data_inicio: Optional[date] = None,
    data_fim: Optional[date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apaga classificações LLM e refaz do zero. Mantém correções manuais."""
    from app.models.user import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem executar esta operação")

    hoje = date.today()
    d_inicio = data_inicio or (hoje - timedelta(days=30))
    d_fim = data_fim or hoje

    q = _base_query(db, "todos", d_inicio, d_fim, somente_processadas=False)
    mencoes = q.all()

    ids = [m.id for m in mencoes]
    overrides = _load_overrides(db, ids)

    atualizadas = 0
    for m in mencoes:
        ov = overrides.get(m.id)
        if ov and ov.source == "manual":
            continue
        m.sentimento_llm = None
        m.llm_processado = False
        atualizadas += 1

    db.commit()

    # Dispara classificação imediata (primeiras 100)
    from app.services.sync import classificar_pendentes
    classificadas = classificar_pendentes(db, limite=100)

    return {
        "ok": True,
        "resetadas": atualizadas,
        "classificadas_agora": classificadas,
        "mensagem": f"{atualizadas} resetadas · {classificadas} reclassificadas (restante em background)",
    }


@router.post("/classificar-texto")
def classificar_texto_avulso(
    texto: str = Body(..., embed=True),
    current_user: User = Depends(get_current_user),
):
    resultado = classificar_sentimento(texto)
    return {"sentimento": resultado, "texto": texto[:100]}


# ─── gerenciamento do token V-Tracker ───────────────────────────────────────

@router.post("/token")
def atualizar_token(
    token: str,
    current_user: User = Depends(get_current_user),
):
    from app.models.user import UserRole
    if current_user.role != UserRole.admin:
        raise HTTPException(403, "Apenas administradores podem atualizar o token")
    vtracker.set_token(token)
    return {"ok": True, "mensagem": "Token atualizado com sucesso"}
