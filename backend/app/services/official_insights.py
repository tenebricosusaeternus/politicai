import logging
import hashlib
import mimetypes
import os
import re
from datetime import date, datetime, timedelta
from typing import Optional

import httpx
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.official_insight import (
    OfficialInsightAccount,
    OfficialInsightSnapshot,
    OfficialPost,
)
from app.services.vtracker.client import vtracker

logger = logging.getLogger(__name__)

OFFICIAL_ACCOUNT_IDS = (1082, 1083)
UPLOAD_ROOT = os.path.join(os.getcwd(), "uploads", "official_posts")


def parse_num(valor) -> int:
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


def cache_thumbnail(url: str, post_id: str) -> str:
    """Baixa miniaturas voláteis das CDNs sociais e expõe via /uploads."""
    if not url or url.startswith("/uploads/") or url.startswith("data:"):
        return url or ""

    os.makedirs(UPLOAD_ROOT, exist_ok=True)
    digest = hashlib.sha1(f"{post_id}:{url}".encode("utf-8")).hexdigest()

    existing = next((name for name in os.listdir(UPLOAD_ROOT) if name.startswith(f"{digest}.")), None)
    if existing:
        return f"/uploads/official_posts/{existing}"

    try:
        with httpx.Client(
            timeout=20,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
            content_type = (resp.headers.get("content-type") or "").split(";")[0].strip()
            if not content_type.startswith("image/"):
                return url
            ext = mimetypes.guess_extension(content_type) or ".jpg"
            filename = f"{digest}{ext}"
            with open(os.path.join(UPLOAD_ROOT, filename), "wb") as f:
                f.write(resp.content)
            return f"/uploads/official_posts/{filename}"
    except Exception:
        logger.debug("Falha ao baixar thumbnail oficial %s", post_id)
        return url


def variacao(atual: int, anterior: int) -> dict:
    pct = None if anterior == 0 else round((atual - anterior) / anterior * 100, 1)
    return {"atual": atual, "anterior": anterior, "delta": atual - anterior, "pct": pct}


def _header_value(header_map: dict, metric_key: str, value_key: str) -> int:
    dados = (header_map or {}).get(metric_key) or {}
    valores = dados.get("nomeValores") or {}
    return parse_num(valores.get(value_key))


def _header_total(header_map: dict, metric_key: str, value_key: str = "header.total") -> int:
    return _header_value(header_map, metric_key, value_key)


def _metric_latest(metricas_por_data: dict) -> dict:
    if not metricas_por_data:
        return {}
    datas = sorted(metricas_por_data.keys())
    latest = metricas_por_data.get(datas[-1]) or {}
    result = {}
    for nome, valor in latest.items():
        result[nome] = parse_num(valor.get("valor") if isinstance(valor, dict) else valor)
    return result


def _metric_any(metricas: dict, *nomes: str) -> int:
    return max((parse_num(metricas.get(nome)) for nome in nomes), default=0)


def _parse_post_date(valor: str) -> Optional[datetime]:
    if not valor:
        return None
    for fmt in ("%d/%m/%Y %H:%M", "%d/%m/%y %H:%M", "%b %d, %Y %I:%M:%S %p"):
        try:
            return datetime.strptime(valor, fmt)
        except ValueError:
            pass
    return None


def _rede_from_conta(conta: dict) -> str:
    texto = " ".join(str(v or "") for v in (
        conta.get("rede"),
        conta.get("servico_descricao"),
        (conta.get("servico") or {}).get("nome") if isinstance(conta.get("servico"), dict) else "",
        (conta.get("servico") or {}).get("tipoRede") if isinstance(conta.get("servico"), dict) else "",
        conta.get("nome"),
    ))
    if "Instagram" in texto:
        return "Instagram"
    if "Facebook" in texto:
        return "Facebook"
    return texto.strip() or "Canal"


def _metric_sum(metricas: dict, *nomes: str) -> int:
    return sum(parse_num(metricas.get(nome)) for nome in nomes)


def _metric_max(metricas: dict, *nomes: str) -> int:
    return max((parse_num(metricas.get(nome)) for nome in nomes), default=0)


def _metric_total(metricas: dict, *nomes: str) -> int:
    total = 0
    for nome in nomes:
        valor = metricas.get(nome)
        if isinstance(valor, list):
            total += sum(parse_num(v) for v in valor)
        else:
            total += parse_num(valor)
    return total


def _metric_peak(metricas: dict, *nomes: str) -> int:
    valores = []
    for nome in nomes:
        valor = metricas.get(nome)
        if isinstance(valor, list):
            valores.extend(parse_num(v) for v in valor)
        else:
            valores.append(parse_num(valor))
    return max(valores, default=0)


def _profile_add(metricas: dict, nome: str, valor: int) -> None:
    metricas.setdefault(nome, []).append(valor)


def _normalizar_developer_item(item: dict) -> dict:
    conta = item.get("conta") or {}
    rede = _rede_from_conta(conta)
    perfil_metricas: dict[str, int] = {}
    posts_map: dict[str, dict] = {}
    imagem = ""

    for insight in item.get("insights") or []:
        for dado in insight.get("dados") or []:
            nome = dado.get("descricao")
            if not nome:
                continue
            valor = parse_num(dado.get("valor"))
            post = dado.get("post") or {}
            post_id = post.get("hash") or post.get("idOcorrenciaServico") or post.get("id")
            is_post = bool(post.get("descricao") or post.get("link") or post.get("thumbnail") or post.get("fullPicture"))

            autor = post.get("autor") if isinstance(post.get("autor"), dict) else {}
            if autor:
                imagem = imagem or autor.get("urlFoto") or ""
                perfil_metricas["autor_alcance"] = max(
                    perfil_metricas.get("autor_alcance", 0),
                    parse_num(autor.get("alcance")),
                )

            if is_post and post_id:
                key = f"{conta.get('id')}:{post_id}"
                row = posts_map.setdefault(key, {
                    "id": key,
                    "data": post.get("dataFormatada") or post.get("data") or "",
                    "data_dt": _parse_post_date(post.get("dataFormatada") or post.get("data") or ""),
                    "tipo": post.get("tipoConteudo") or "",
                    "texto": re.sub(r"\s+", " ", (post.get("descricao") or "")).strip(),
                    "link": post.get("link") or "",
                    "thumbnail": post.get("thumbnail") or post.get("fullPicture") or "",
                    "metricas": {},
                })
                # A API pública repete métricas de posts ao longo dos dias
                # como valores acumulados. Somar essas linhas infla o
                # engajamento; para post, mantemos o maior valor observado.
                row["metricas"][nome] = max(parse_num(row["metricas"].get(nome)), valor)
            else:
                _profile_add(perfil_metricas, nome, valor)

    top_posts = []
    for row in posts_map.values():
        metricas = row["metricas"]
        likes = _metric_sum(metricas, "likes", "like", "page_actions_post_reactions_like_total")
        comentarios = _metric_sum(metricas, "comments", "replies")
        compartilhamentos = _metric_sum(metricas, "shares")
        salvos = _metric_sum(metricas, "saved")
        reactions = _metric_sum(
            metricas,
            "post_reactions_by_type_total",
            "page_actions_post_reactions_love_total",
            "page_actions_post_reactions_haha_total",
            "page_actions_post_reactions_wow_total",
            "page_actions_post_reactions_sorry_total",
            "page_actions_post_reactions_anger_total",
        )
        engajamento = likes + comentarios + compartilhamentos + salvos + reactions
        top_posts.append({
            **row,
            "likes": likes,
            "comentarios": comentarios,
            "compartilhamentos": compartilhamentos,
            "salvos": salvos,
            "reacoes": reactions,
            "engajamento": engajamento,
        })
    top_posts.sort(key=lambda p: p["engajamento"], reverse=True)

    post_metricas = {}
    for post in posts_map.values():
        for nome, valor in post["metricas"].items():
            post_metricas[nome] = parse_num(post_metricas.get(nome)) + parse_num(valor)

    page_reactions = {
        "likes": _metric_total(perfil_metricas, "page_actions_post_reactions_like_total"),
        "love": _metric_total(perfil_metricas, "page_actions_post_reactions_love_total"),
        "haha": _metric_total(perfil_metricas, "page_actions_post_reactions_haha_total"),
        "wow": _metric_total(perfil_metricas, "page_actions_post_reactions_wow_total"),
        "sad": _metric_total(perfil_metricas, "page_actions_post_reactions_sorry_total"),
        "angry": _metric_total(perfil_metricas, "page_actions_post_reactions_anger_total"),
    }
    seguidores = max(
        _metric_peak(perfil_metricas, "total_followers_count", "follower_count"),
        parse_num(perfil_metricas.get("autor_alcance")),
    )
    alcance = _metric_total(perfil_metricas, "reach", "page_impressions_unique")
    if not alcance:
        alcance = _metric_sum(post_metricas, "reach", "post_impressions_unique")
    impressoes = _metric_total(perfil_metricas, "page_posts_impressions", "page_impressions", "impressions")

    perfil = {
        "seguidores": seguidores,
        "saldo_seguidores": _metric_total(perfil_metricas, "follower_count", "page_daily_follows_unique") - _metric_total(
            perfil_metricas, "page_daily_unfollows_unique"
        ),
        "alcance": alcance,
        "impressoes": impressoes,
        "impressoes_organicas": _metric_total(perfil_metricas, "page_posts_impressions_organic"),
        "follows": _metric_total(perfil_metricas, "follower_count", "page_daily_follows_unique"),
        "unfollows": _metric_total(perfil_metricas, "page_daily_unfollows_unique"),
        "views": _metric_total(perfil_metricas, "page_views_total", "page_video_views"),
    }

    postagens = {
        "total_posts": len(posts_map),
        "likes": _metric_sum(post_metricas, "likes", "like") + page_reactions["likes"],
        "comentarios": _metric_sum(post_metricas, "comments", "replies"),
        "compartilhamentos": _metric_sum(post_metricas, "shares"),
        "salvos": _metric_sum(post_metricas, "saved"),
        "love": page_reactions["love"],
        "haha": page_reactions["haha"],
        "wow": page_reactions["wow"],
        "sad": page_reactions["sad"],
        "angry": page_reactions["angry"],
    }
    postagens["engajamento_total"] = sum(postagens[k] for k in (
        "likes", "comentarios", "compartilhamentos", "salvos",
        "love", "haha", "wow", "sad", "angry",
    ))

    return {
        "id": conta.get("id"),
        "nome": conta.get("nome") or conta.get("descricao") or "",
        "rede": rede,
        "imagem": imagem,
        "servico": (conta.get("servico") or {}).get("nome") if isinstance(conta.get("servico"), dict) else "",
        "perfil": perfil,
        "postagens": postagens,
        "crescimento": None,
        "top_posts": top_posts[:8],
        "raw": item,
    }


def normalizar_insight_item(item: dict) -> dict:
    if item.get("api_origem") == "developer":
        return _normalizar_developer_item(item)

    conta = item.get("conta") or {}
    cabecalho = item.get("cabecalho") or {}
    perfil_header = ((cabecalho.get("perfilHeader") or {}).get("headerMap") or {})
    post_header = ((cabecalho.get("postHeader") or {}).get("headerMap") or {})
    posts_raw = item.get("posts") or {}
    rede = conta.get("rede") or item.get("tipoRede") or ""

    is_instagram = "Instagram" in rede
    is_facebook = "Facebook" in rede

    seguidores = _header_value(perfil_header, "header.total_followers_count", "header.total")
    if not seguidores:
        vals = ((perfil_header.get("header.total_followers_count") or {}).get("nomeValores") or {})
        seguidores = max((parse_num(v) for k, v in vals.items() if "maximo" in k or "total" in k), default=0)

    reach_vals = ((perfil_header.get("header.reach") or {}).get("nomeValores") or {})
    perfil = {
        "seguidores": seguidores,
        "saldo_seguidores": _header_value(perfil_header, "header.total_followers_count", "header.saldo"),
        "alcance": max((parse_num(v) for k, v in reach_vals.items() if "maximo" in k or "total" in k), default=0),
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
        "follows": _header_value(perfil_header, "header.page_daily_follows", "header.page_daily_follows_unique"),
        "unfollows": _header_value(perfil_header, "header.page_daily_follows", "header.page_daily_unfollows_unique"),
        "views": _header_value(perfil_header, "header.page_views_total_title", "header.page_views_total"),
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
            "data_dt": _parse_post_date(post.get("dataFormatada") or ""),
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
            "metricas": metricas,
        })
    top_posts.sort(key=lambda p: p["engajamento"], reverse=True)

    return {
        "id": conta.get("id"),
        "nome": conta.get("nome") or "",
        "rede": "Instagram" if is_instagram else "Facebook" if is_facebook else rede,
        "imagem": conta.get("imagemPerfil") or item.get("imagemPerfil") or "",
        "servico": item.get("tipoRede") or "",
        "perfil": perfil,
        "postagens": postagens,
        "crescimento": None,
        "top_posts": top_posts[:8],
        "raw": item,
    }


def aplicar_crescimento(atual: dict, anterior: Optional[dict]) -> dict:
    if not anterior:
        anterior = {"perfil": {}, "postagens": {}}
    atual["crescimento"] = {
        "seguidores": variacao(atual["perfil"].get("seguidores", 0), anterior["perfil"].get("seguidores", 0)),
        "alcance_ou_impressoes": variacao(
            max(atual["perfil"].get("alcance", 0), atual["perfil"].get("impressoes", 0)),
            max(anterior["perfil"].get("alcance", 0), anterior["perfil"].get("impressoes", 0)),
        ),
        "engajamento": variacao(
            atual["postagens"].get("engajamento_total", 0),
            anterior["postagens"].get("engajamento_total", 0),
        ),
        "posts": variacao(atual["postagens"].get("total_posts", 0), anterior["postagens"].get("total_posts", 0)),
    }
    return atual


def _public_item(item: dict) -> dict:
    return {k: v for k, v in item.items() if k != "raw"}


def sync_official_insights_periodo(db: Session, d_inicio: date, d_fim: date) -> dict:
    contas = vtracker.contas_insights()
    selecionadas = [c for c in contas if c.get("id") in OFFICIAL_ACCOUNT_IDS]
    snapshots = posts = 0

    for conta in selecionadas:
        dados = vtracker.insights_filtro([conta], d_inicio, d_fim)
        for item in dados:
            norm = normalizar_insight_item(item)
            db.execute(pg_insert(OfficialInsightAccount).values({
                "id": norm["id"],
                "nome": norm["nome"],
                "rede": norm["rede"],
                "imagem": norm["imagem"],
                "servico": norm["servico"],
                "ativo": 1,
            }).on_conflict_do_update(
                index_elements=["id"],
                set_={
                    "nome": norm["nome"],
                    "rede": norm["rede"],
                    "imagem": norm["imagem"],
                    "servico": norm["servico"],
                    "ativo": 1,
                    "atualizado_em": datetime.utcnow(),
                },
            ))
            db.execute(pg_insert(OfficialInsightSnapshot).values({
                "conta_id": norm["id"],
                "periodo_inicio": d_inicio,
                "periodo_fim": d_fim,
                "perfil": norm["perfil"],
                "postagens": norm["postagens"],
                "raw": norm["raw"],
            }).on_conflict_do_update(
                constraint="uq_official_snapshot_period",
                set_={
                    "perfil": norm["perfil"],
                    "postagens": norm["postagens"],
                    "raw": norm["raw"],
                    "atualizado_em": datetime.utcnow(),
                },
            ))
            snapshots += 1
            for post in norm["top_posts"]:
                thumbnail = cache_thumbnail(post["thumbnail"], post["id"])
                db.execute(pg_insert(OfficialPost).values({
                    "id": post["id"],
                    "conta_id": norm["id"],
                    "rede": norm["rede"],
                    "data": post["data_dt"],
                    "data_formatada": post["data"],
                    "tipo": post["tipo"],
                    "texto": post["texto"],
                    "link": post["link"],
                    "thumbnail": thumbnail,
                    "likes": post["likes"],
                    "comentarios": post["comentarios"],
                    "compartilhamentos": post["compartilhamentos"],
                    "salvos": post["salvos"],
                    "reacoes": post["reacoes"],
                    "engajamento": post["engajamento"],
                    "metricas": post["metricas"],
                }).on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "conta_id": norm["id"],
                        "rede": norm["rede"],
                        "data": post["data_dt"],
                        "data_formatada": post["data"],
                        "tipo": post["tipo"],
                        "texto": post["texto"],
                        "link": post["link"],
                        "thumbnail": thumbnail,
                        "likes": post["likes"],
                        "comentarios": post["comentarios"],
                        "compartilhamentos": post["compartilhamentos"],
                        "salvos": post["salvos"],
                        "reacoes": post["reacoes"],
                        "engajamento": post["engajamento"],
                        "metricas": post["metricas"],
                        "atualizado_em": datetime.utcnow(),
                    },
                ))
                posts += 1
    db.commit()
    return {"snapshots": snapshots, "posts": posts}


def sync_official_insights_recente(db: Session, dias: int = 7) -> dict:
    hoje = date.today()
    d_inicio = hoje - timedelta(days=dias - 1)
    atual = sync_official_insights_periodo(db, d_inicio, hoje)
    ant_fim = d_inicio - timedelta(days=1)
    ant_inicio = ant_fim - timedelta(days=dias - 1)
    anterior = sync_official_insights_periodo(db, ant_inicio, ant_fim)
    return {
        "periodo_atual": atual,
        "periodo_anterior": anterior,
    }


def get_official_insights_local(db: Session, d_inicio: date, d_fim: date) -> dict:
    delta_dias = max(1, (d_fim - d_inicio).days + 1)
    ant_fim = d_inicio - timedelta(days=1)
    ant_inicio = ant_fim - timedelta(days=delta_dias - 1)

    contas = {c.id: c for c in db.query(OfficialInsightAccount).filter(OfficialInsightAccount.ativo == 1).all()}
    rows = db.query(OfficialInsightSnapshot).filter(
        OfficialInsightSnapshot.periodo_inicio == d_inicio,
        OfficialInsightSnapshot.periodo_fim == d_fim,
    ).all()
    ant_rows = db.query(OfficialInsightSnapshot).filter(
        OfficialInsightSnapshot.periodo_inicio == ant_inicio,
        OfficialInsightSnapshot.periodo_fim == ant_fim,
    ).all()
    anteriores = {r.conta_id: r for r in ant_rows}

    resultados = []
    for row in rows:
        conta = contas.get(row.conta_id)
        if not conta:
            continue
        posts = db.query(OfficialPost).filter(
            OfficialPost.conta_id == row.conta_id,
            OfficialPost.data >= datetime.combine(d_inicio, datetime.min.time()),
            OfficialPost.data < datetime.combine(d_fim + timedelta(days=1), datetime.min.time()),
        ).order_by(OfficialPost.engajamento.desc()).limit(8).all()
        item = {
            "id": conta.id,
            "nome": conta.nome,
            "rede": conta.rede,
            "imagem": conta.imagem or "",
            "perfil": row.perfil,
            "postagens": row.postagens,
            "crescimento": None,
            "top_posts": [
                {
                    "id": p.id,
                    "data": p.data_formatada or "",
                    "tipo": p.tipo or "",
                    "texto": p.texto or "",
                    "link": p.link or "",
                    "thumbnail": p.thumbnail or "",
                    "likes": p.likes or 0,
                    "comentarios": p.comentarios or 0,
                    "compartilhamentos": p.compartilhamentos or 0,
                    "salvos": p.salvos or 0,
                    "reacoes": p.reacoes or 0,
                    "engajamento": p.engajamento or 0,
                }
                for p in posts
            ],
        }
        anterior_row = anteriores.get(row.conta_id)
        anterior = {"perfil": anterior_row.perfil, "postagens": anterior_row.postagens} if anterior_row else None
        resultados.append(aplicar_crescimento(item, anterior))

    totais = {
        "seguidores": sum(c["perfil"].get("seguidores", 0) for c in resultados),
        "alcance": sum(c["perfil"].get("alcance", 0) for c in resultados),
        "impressoes": sum(c["perfil"].get("impressoes", 0) for c in resultados),
        "engajamento": sum(c["postagens"].get("engajamento_total", 0) for c in resultados),
        "posts": sum(c["postagens"].get("total_posts", 0) for c in resultados),
    }
    top_posts = sorted(
        [
            {**p, "rede": c["rede"], "conta": c["nome"]}
            for c in resultados
            for p in c.get("top_posts", [])
        ],
        key=lambda p: p["engajamento"],
        reverse=True,
    )[:10]
    return {
        "periodo": {
            "inicio": d_inicio.isoformat(),
            "fim": d_fim.isoformat(),
            "anterior_inicio": ant_inicio.isoformat(),
            "anterior_fim": ant_fim.isoformat(),
        },
        "contas": [_public_item(c) for c in resultados],
        "totais": totais,
        "top_posts": top_posts,
    }
