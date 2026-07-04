"""
Classificação de sentimento político via LLM local (Qwen via mlx-lm).
Quatro classes: POSITIVA, NEGATIVA, NEUTRA, IRRELEVANTE.
Primeiro decide relevância política/municipal. Só depois classifica sentimento.
"""
import logging
from typing import Optional
from app.services.ai.llm_router import LLMTask, chat_completion
from app.services.ai.prompt_registry import get_prompt

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Você é um classificador de relevância e sentimento político especializado em política municipal brasileira.
Analise publicações que podem mencionar o prefeito Igor Normando, a Prefeitura de Belém do Pará ou temas urbanos/administrativos da cidade de Belém.

Classifique usando EXATAMENTE uma das quatro categorias:

POSITIVA — a publicação menciona Igor Normando ou a Prefeitura de Belém de forma favorável: elogio, apoio, agradecimento, aprovação, parabenização, cobertura positiva de obras ou ações.

NEGATIVA — a publicação menciona Igor Normando ou a Prefeitura de Belém de forma desfavorável: crítica, protesto, reprovação, acusação, denúncia, ironia negativa, reclamação de serviço público, cobertura desfavorável.

NEUTRA — use somente quando a publicação for claramente relevante para Igor Normando, Prefeitura de Belém ou tema municipal de Belém, mas for estritamente factual/informativa, sem elogio, crítica, cobrança, denúncia, aprovação ou reprovação.

IRRELEVANTE — a publicação NÃO se refere ao prefeito Igor Normando, à Prefeitura de Belém ou a tema municipal pertinente à cidade de Belém; é spam, propaganda comercial, conteúdo pessoal, sorteio, entretenimento, ou menciona outros políticos/cidades sem implicação direta para Belém.

IMPORTANTE:
- Faça a decisão em duas etapas: primeiro relevância municipal; depois sentimento.
- Se não houver relação clara com prefeito, prefeitura, administração municipal, serviços públicos, obras, zeladoria, saúde, educação, transporte, segurança urbana, eventos públicos, orçamento, servidores, bairros ou problemas da cidade de Belém = IRRELEVANTE.
- NEUTRA é exceção. Na dúvida entre NEUTRA e POSITIVA/NEGATIVA, prefira POSITIVA ou NEGATIVA conforme o efeito provável para a imagem do prefeito/prefeitura.
- Dúvida, pedido ou reclamação sobre serviço público de Belém = NEGATIVA (sinaliza insatisfação).
- Notícia factual sobre obras ou eventos da Prefeitura: avalie se o contexto é favorável (POSITIVA) ou desfavorável (NEGATIVA) para a imagem do prefeito.

Responda APENAS com uma palavra: POSITIVA, NEGATIVA, NEUTRA ou IRRELEVANTE."""

SENTIMENTOS_VALIDOS = {"POSITIVA", "NEGATIVA", "NEUTRA", "IRRELEVANTE"}
CLASSIFICATION_PROMPT_VERSION = "fast_relevance_sentiment_classifier_v1.0.0"


def _system_prompt() -> str:
    try:
        return get_prompt(CLASSIFICATION_PROMPT_VERSION)
    except Exception:
        return SYSTEM_PROMPT


def classificar_sentimento(texto: str) -> Optional[str]:
    """
    Classifica o sentimento de um texto via Qwen local.
    Retorna "POSITIVA", "NEGATIVA", "NEUTRA" ou "IRRELEVANTE".
    Nunca lança exceção. Em erro de LLM, retorna None para manter a menção pendente.
    """
    if not texto or not texto.strip():
        return "IRRELEVANTE"

    try:
        resposta = chat_completion(
            task=LLMTask.FAST_CLASSIFICATION,
            max_tokens=20,
            temperature=0,
            thinking=False,
            timeout=30,
            messages=[
                {"role": "system", "content": _system_prompt()},
                {"role": "user", "content": texto[:800]},
            ],
        ).upper()
        palavra = resposta.split()[0].rstrip(".,!?") if resposta else "IRRELEVANTE"
        return palavra if palavra in SENTIMENTOS_VALIDOS else None
    except Exception as e:
        logger.warning(f"Erro na classificação LLM: {e}")
        return None


def classificar_batch(textos: list) -> list:
    """Classifica uma lista de textos sequencialmente."""
    return [classificar_sentimento(t) for t in textos]


import re as _re

_BATCH_INSTRUCAO = (
    "Classifique CADA publicação numerada abaixo. Responda com UMA linha por item, "
    "no formato exato 'N: CATEGORIA', onde CATEGORIA é POSITIVA, NEGATIVA, NEUTRA ou IRRELEVANTE. "
    "Não escreva nenhum outro texto.\n\n"
)


def classificar_lote_llm(textos: list) -> list:
    """
    Classifica vários textos em UMA única chamada ao LLM (numerado), ~10x mais
    rápido que item-a-item. Retorna lista alinhada por índice; posições que o
    modelo não devolveu/parseou vêm como None (o chamador faz fallback).
    """
    if not textos:
        return []

    linhas = []
    for i, t in enumerate(textos, 1):
        limpo = (t or "").strip().replace("\n", " ")[:180] or "(vazio)"
        linhas.append(f"{i}: {limpo}")
    user = _BATCH_INSTRUCAO + "\n".join(linhas)

    try:
        content = chat_completion(
            task=LLMTask.FAST_CLASSIFICATION,
            max_tokens=len(textos) * 8 + 50,
            temperature=0,
            thinking=False,
            timeout=180,
            messages=[
                {"role": "system", "content": _system_prompt()},
                {"role": "user", "content": user},
            ],
        )
    except Exception as e:
        logger.warning(f"Erro na classificação em lote: {e}")
        return [None] * len(textos)

    labels: dict = {}
    for ln in content.splitlines():
        m = _re.match(r"\s*(\d+)\s*[:.\)\-]\s*([A-Za-zÀ-ÿ]+)", ln)
        if m:
            idx = int(m.group(1))
            lab = m.group(2).strip().upper()
            if lab in SENTIMENTOS_VALIDOS:
                labels[idx] = lab
    return [labels.get(i) for i in range(1, len(textos) + 1)]


TEMAS_PROMPT = """Você é um analista político especializado em política municipal brasileira.
Analise as publicações abaixo sobre o prefeito de Belém do Pará e identifique os principais temas políticos recorrentes.

Publicações (numeradas de 0):
{publicacoes}

Retorne SOMENTE este JSON, sem texto adicional, sem markdown:
{{
  "temas": [
    {{"nome": "Nome do Tema", "indices": [0, 3, 7, 12]}}
  ]
}}

Regras obrigatórias:
- Máximo 8 temas
- Inclua apenas temas que aparecem em pelo menos 2 publicações
- Nome do tema: claro, em português, máximo 4 palavras (ex: "Obras e Infraestrutura", "Saúde Pública", "Transporte")
- Cada índice aparece em apenas 1 tema — o mais relevante para aquela publicação
- Ignore publicações que não tratam de temas políticos específicos
- Ordene os temas do mais ao menos frequente"""


def extrair_temas_llm(ocorrencias: list) -> list:
    """
    Recebe lista de {texto, sentimento} e usa o Qwen para identificar os
    temas políticos que emergem do conteúdo. Uma única chamada LLM para
    até 80 menções. Retorna o mesmo formato de extrair_temas().
    Usa fallback para lista vazia em caso de erro.
    """
    import json as _json

    if not ocorrencias:
        return []

    # Limita a 80 menções para não exceder o contexto
    amostra = ocorrencias[:80]

    linhas = []
    for i, oc in enumerate(amostra):
        texto = (oc.get("texto") or "").strip().replace("\n", " ")[:200]
        if texto:
            linhas.append(f"{i}. {texto}")

    if len(linhas) < 2:
        return []

    publicacoes = "\n".join(linhas)
    prompt = TEMAS_PROMPT.format(publicacoes=publicacoes)

    try:
        content = chat_completion(
            task=LLMTask.THEME_EXTRACTION,
            max_tokens=800,
            temperature=0,
            thinking=False,
            timeout=90,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        logger.warning(f"Erro ao chamar LLM para temas: {e}")
        return []

    # Remove markdown code blocks se presentes
    if "```" in content:
        partes = content.split("```")
        for parte in partes:
            if "{" in parte:
                content = parte.lstrip("json").strip()
                break

    # Extrai JSON da resposta
    try:
        inicio = content.index("{")
        fim = content.rindex("}") + 1
        data = _json.loads(content[inicio:fim])
    except Exception as e:
        logger.warning(f"Falha ao parsear JSON de temas: {e} — resposta: {content[:200]}")
        return []

    temas_raw = data.get("temas", [])
    if not isinstance(temas_raw, list):
        return []

    resultado = []
    for item in temas_raw:
        nome = (item.get("nome") or "").strip()
        indices = [i for i in (item.get("indices") or []) if isinstance(i, int) and 0 <= i < len(amostra)]

        if not nome or len(indices) < 2:
            continue

        positivas = sum(1 for i in indices if amostra[i].get("sentimento") == "POSITIVA")
        negativas = sum(1 for i in indices if amostra[i].get("sentimento") == "NEGATIVA")
        total = len(indices)
        neutras = total - positivas - negativas

        resultado.append({
            "slug": nome.lower().replace(" ", "_").replace("/", "_")[:40],
            "nome": nome,
            "total": total,
            "positivas": positivas,
            "negativas": negativas,
            "neutras": neutras,
            "pct_positivo": round(positivas / total * 100, 1) if total else 0,
            "pct_negativo": round(negativas / total * 100, 1) if total else 0,
        })

    resultado.sort(key=lambda x: x["total"], reverse=True)
    return resultado[:8]
