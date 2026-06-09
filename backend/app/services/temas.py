"""
Classificação de menções por tema usando correspondência de palavras-chave.
Taxonomia: temas políticos relevantes para Belém / Igor Normando.
"""

from collections import defaultdict
from typing import List

TEMAS: list[dict] = [
    {
        "slug": "obras_urbanas",
        "nome": "Obras e Infraestrutura",
        "keywords": [
            "asfalto", "obra", "calçada", "buraco", "recapeamento", "pavimentação",
            "construção", "reforma", "ponte", "viaduto", "drenagem", "rua", "avenida",
            "reconstrução", "recuperação", "implantação", "urbanização",
        ],
    },
    {
        "slug": "transporte",
        "nome": "Transporte Público",
        "keywords": [
            "ônibus", "bus", "brt", "van", "transporte", "passagem", "metrô",
            "taxi", "uber", "motorista", "trânsito", "tráfego", "mobilidade",
            "semaforo", "semáforo",
        ],
    },
    {
        "slug": "saude",
        "nome": "Saúde",
        "keywords": [
            "hospital", "upa", "saúde", "médico", "enfermeiro", "vacina", "posto",
            "unidade básica", "ubs", "sus", "dengue", "covid", "medicamento",
            "consulta", "atendimento médico", "ambulância",
        ],
    },
    {
        "slug": "seguranca",
        "nome": "Segurança Pública",
        "keywords": [
            "segurança", "violência", "crime", "policia", "polícia", "assalto",
            "roubo", "homicídio", "bandido", "briga", "conflito", "perigoso",
            "medo", "câmera", "monitoramento policial",
        ],
    },
    {
        "slug": "gestao",
        "nome": "Gestão Municipal",
        "keywords": [
            "prefeitura", "prefeito", "secretaria", "secretário", "gestão",
            "administração", "governo", "cargo", "nomeação", "licitação",
            "contrato", "lei", "decreto", "aprovação", "câmara", "vereador",
            "investimento", "orçamento", "recurso",
        ],
    },
    {
        "slug": "educacao",
        "nome": "Educação",
        "keywords": [
            "escola", "aluno", "professor", "educação", "ensino", "creche",
            "fundamental", "médio", "merenda", "uniforme", "sala de aula",
            "pedagógico", "alfabetização",
        ],
    },
    {
        "slug": "enchentes",
        "nome": "Enchentes e Chuvas",
        "keywords": [
            "enchente", "alagamento", "chuva", "inundação", "lama", "rio",
            "igarapé", "deslizamento", "desastre", "emergência", "transtorno",
            "água parada", "canal",
        ],
    },
    {
        "slug": "cultura_eventos",
        "nome": "Cultura e Eventos",
        "keywords": [
            "evento", "festival", "show", "cultura", "cirio", "círio",
            "festa", "carnaval", "arraial", "quadrilha", "turismo", "teatro",
            "parque", "praça", "lazer",
        ],
    },
    {
        "slug": "social",
        "nome": "Proteção Social",
        "keywords": [
            "social", "família", "bolsa", "benefício", "pobreza", "vulnerável",
            "assistência", "cras", "creas", "morador de rua", "habitação",
            "moradia", "minha casa",
        ],
    },
    {
        "slug": "politica",
        "nome": "Política e Eleições",
        "keywords": [
            "eleição", "candidato", "voto", "partido", "deputado", "senador",
            "governador", "oposição", "aliado", "coligação", "campanha",
            "urna", "tse", "reeleição",
        ],
    },
]


def _classificar_texto(texto: str) -> list[str]:
    """Retorna os slugs de tema que fazem match no texto."""
    texto_lower = texto.lower()
    matches = []
    for tema in TEMAS:
        for kw in tema["keywords"]:
            if kw in texto_lower:
                matches.append(tema["slug"])
                break  # um match por tema é suficiente
    return matches


def extrair_temas(ocorrencias: list[dict]) -> list[dict]:
    """
    Recebe lista de ocorrências (dicts com 'texto' e 'sentimento') e
    retorna os temas ordenados por volume de menções.
    """
    contagem: dict[str, dict] = defaultdict(
        lambda: {"total": 0, "positivas": 0, "negativas": 0, "neutras": 0}
    )

    total_classificadas = 0
    for oc in ocorrencias:
        texto = oc.get("texto", "")
        sentimento = oc.get("sentimento", "NEUTRA")
        slugs = _classificar_texto(texto)
        if slugs:
            total_classificadas += 1
        for slug in slugs:
            contagem[slug]["total"] += 1
            if sentimento == "POSITIVA":
                contagem[slug]["positivas"] += 1
            elif sentimento == "NEGATIVA":
                contagem[slug]["negativas"] += 1
            else:
                contagem[slug]["neutras"] += 1

    # Mapear slugs para nomes e ordenar por volume
    nomes = {t["slug"]: t["nome"] for t in TEMAS}
    resultado = []
    for slug, counts in contagem.items():
        total = counts["total"]
        resultado.append({
            "slug": slug,
            "nome": nomes.get(slug, slug),
            "total": total,
            "positivas": counts["positivas"],
            "negativas": counts["negativas"],
            "neutras": counts["neutras"],
            "pct_positivo": round(counts["positivas"] / total * 100, 1) if total else 0,
            "pct_negativo": round(counts["negativas"] / total * 100, 1) if total else 0,
        })

    resultado.sort(key=lambda x: x["total"], reverse=True)
    return resultado[:8]  # top 8 temas
