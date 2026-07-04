import re
from functools import lru_cache

from app.models.mencao import Mencao
from app.services.monitoring_taxonomy import (
    AGENCIES,
    CORE_IDENTITY,
    LOCAL_GEOGRAPHY,
    PROGRAMS_AND_DELIVERIES,
    RISK_TERMS,
)


PUNCT_RE = re.compile(r"[^\w\sáàãâéèêíìîóòõôúùûç-]", re.I)

OUTSIDE_BELEM_TERMS = {
    "ananindeua", "marituba", "benevides", "santa bárbara", "santa barbara",
    "castanhal", "santarém", "santarem", "mojuí", "mojui", "mojuí dos campos",
    "mojui dos campos", "tailândia", "tailandia", "parauapebas", "marabá", "maraba",
    "altamira", "bragança", "braganca", "abaetetuba", "barcarena", "salinópolis",
    "salinopolis", "capanema", "itaituba", "tucuruí", "tucurui", "rio das ostras",
    "macaé", "macae", "cabo frio", "búzios", "buzios", "araruama", "saquarema",
    "mato grosso", "cuiabá", "cuiaba", "contorno leste", "agro mt", "agro.mt",
    "abilio brunini", "abílio brunini",
    "belém do são francisco", "belem do sao francisco",
    "belém de são francisco", "belem de sao francisco",
    "belém de maria", "belem de maria",
    "belém do brejo do cruz", "belem do brejo do cruz",
}

OUTSIDE_BELEM_DOMAINS = {
    "riodasostrasjornal.blogspot.com",
}

GENERIC_PUBLIC_SAFETY_TERMS = {
    "assalto", "roubo", "furto", "homicídio", "homicidio", "latrocínio", "latrocinio",
    "assalt0", "roub0",
    "tiroteio", "facada", "prisão", "prisao", "preso", "polícia civil", "policia civil",
    "polícia militar", "policia militar", "operação policial", "operacao policial",
    "violência doméstica", "violencia domestica", "fotos íntimas", "fotos intimas",
    "assaltante",
}

GENERIC_ACCIDENT_TERMS = {
    "acidente", "atropelamento", "colisão", "colisao", "batida", "moto", "motocicleta",
    "carro", "caminhão", "caminhao", "despenca", "rodovia", "pa-",
    "incêndio", "incendio", "curto-circuito", "curto circuito", "bombeiros",
}

MUNICIPAL_CONTEXT_TERMS = {
    "igor normando", "prefeitura de belém", "prefeitura de belem",
    "prefeitura municipal de belém", "prefeitura municipal de belem", "prefeito de belém",
    "prefeito de belem", "pmb", "sesma", "semec", "sezel", "seinfra", "segbel", "segov", "sefin", "codem",
    "funpapa", "arbel", "promaben", "gmb", "guarda municipal", "agência belém",
    "agencia belem", "secretaria municipal", "subprefeitura",
}

EXPLICIT_BELEM_ANCHORS = (
    MUNICIPAL_CONTEXT_TERMS
    | AGENCIES
    | {term for term in CORE_IDENTITY if term not in {"prefeitura", "prefeito"}}
)

STRICT_BELEM_ANCHORS = {
    "igor normando", "igor wander centeno normando", "prefeito igor",
    "prefeito de belém", "prefeito de belem", "prefeitura de belém",
    "prefeitura de belem", "prefeitura municipal de belém",
    "prefeitura municipal de belem", "pmb belém", "pmb belem",
    "palácio antônio lemos", "palacio antonio lemos", "agência belém",
    "agencia belem", "belém-pa", "belem-pa", "belém pa", "belem pa",
    "belém do pará", "belem do para", "cidade de belém", "cidade de belem",
    "município de belém", "municipio de belem",
}

AGENCY_SIGLAS = {
    "sesma", "semec", "sezel", "seinfra", "segbel", "segov", "sefin", "segep",
    "semcad", "semma", "setur", "secult", "semte", "semu", "semel", "pgm",
    "cgm", "codem", "funpapa", "belemprev", "arbel", "promaben", "gmb",
}

AMBIGUOUS_LOCAL_GEOGRAPHY = {
    "marco", "brasília", "brasilia", "souza", "una", "universitário",
    "universitario", "campina", "reduto", "condor", "agulha", "cruzeiro",
}

LOCAL_SERVICE_CURATION_TERMS = {
    "coleta de lixo", "coleta de entulho", "lixo", "entulho", "limpeza", "zeladoria",
    "iluminação pública", "iluminacao publica", "boca de lobo", "buraco", "asfalto",
    "alagamento", "canal", "esgoto", "saneamento", "drenagem", "enchente",
    "ônibus", "onibus", "tarifa", "brt", "parada", "terminal", "semaforo", "semáforo",
    "faixa de pedestre", "ciclovia", "ambulantes", "mercado municipal",
    "posto de saúde", "posto de saude", "upa", "ubs", "medicamento", "remédio", "remedio",
    "médico", "medico", "consulta", "exame", "vacina", "escola municipal", "creche",
    "matrícula", "matricula", "merenda", "transporte escolar", "professor",
    "servidor municipal", "concurso", "convocação", "convocacao", "greve", "paralisação",
    "paralisacao", "praça", "praca", "calçada", "calcada", "obra", "obras",
}


def normalize_for_curation(texto: str) -> str:
    texto = (texto or "").lower()
    texto = re.sub(r"https?://\S+|www\.\S+", " ", texto)
    texto = re.sub(r"@\w+", " ", texto)
    texto = PUNCT_RE.sub(" ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def mention_text(m: Mencao) -> str:
    return f"{m.titulo or ''} {m.texto or ''} {m.link or ''} {m.tipo_conteudo or ''} {m.localizacao or ''}".strip()


@lru_cache(maxsize=128)
def _normalized_terms(terms_key: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(f" {term.strip().lower()} " for term in terms_key if term.strip())


def has_any(texto: str, terms: set[str]) -> bool:
    terms_key = tuple(sorted(terms))
    padded_text = f" {texto} "
    for term in _normalized_terms(terms_key):
        if term in padded_text:
            return True
    return False


def has_municipal_anchor(texto: str) -> bool:
    if has_any(texto, STRICT_BELEM_ANCHORS):
        return True
    if has_any(texto, AGENCY_SIGLAS):
        return True
    if has_any(texto, AGENCIES) and ("belém" in texto or "belem" in texto):
        return True
    local_terms = LOCAL_GEOGRAPHY - AMBIGUOUS_LOCAL_GEOGRAPHY
    if has_any(texto, PROGRAMS_AND_DELIVERIES) and (
        "belém" in texto or "belem" in texto or has_any(texto, local_terms)
    ):
        return True
    return False


def has_local_service_anchor(texto: str) -> bool:
    local_terms = LOCAL_GEOGRAPHY - AMBIGUOUS_LOCAL_GEOGRAPHY
    has_safe_local = has_any(texto, local_terms)
    has_ambiguous_local = has_any(texto, AMBIGUOUS_LOCAL_GEOGRAPHY) and has_any(texto, STRICT_BELEM_ANCHORS)
    return (has_safe_local or has_ambiguous_local) and has_any(texto, LOCAL_SERVICE_CURATION_TERMS)


def has_risk_with_municipal_anchor(texto: str) -> bool:
    return has_any(texto, RISK_TERMS) and has_municipal_anchor(texto)


def is_outside_belem_without_anchor(texto: str) -> bool:
    outside = has_any(texto, OUTSIDE_BELEM_TERMS) or has_any(texto, OUTSIDE_BELEM_DOMAINS)
    if not outside:
        return False
    if has_any(texto, STRICT_BELEM_ANCHORS):
        return False
    if has_any(texto, AGENCIES) and ("belém" in texto or "belem" in texto):
        return False
    if has_any(texto, OUTSIDE_BELEM_DOMAINS):
        return True
    return True


def is_generic_safety_or_accident_without_anchor(texto: str) -> bool:
    generic = has_any(texto, GENERIC_PUBLIC_SAFETY_TERMS) or has_any(texto, GENERIC_ACCIDENT_TERMS)
    if not generic:
        return False
    if has_municipal_anchor(texto):
        return False
    transit_public_service = has_any(texto, {
        "ônibus", "onibus", "brt", "tarifa", "parada", "terminal", "semaforo", "semáforo",
        "faixa de pedestre", "operação de trânsito", "operacao de transito", "agente de trânsito",
        "agente de transito", "segbel", "guarda municipal",
    })
    return not transit_public_service


@lru_cache(maxsize=50000)
def is_municipal_political_text(texto: str) -> bool:
    if not texto:
        return False
    if is_outside_belem_without_anchor(texto):
        return False
    if is_generic_safety_or_accident_without_anchor(texto):
        return False
    return has_municipal_anchor(texto) or has_local_service_anchor(texto) or has_risk_with_municipal_anchor(texto)


@lru_cache(maxsize=50000)
def curation_reason_text(texto: str) -> str:
    if is_outside_belem_without_anchor(texto):
        return "fora_de_belem_sem_vinculo_prefeitura"
    if is_generic_safety_or_accident_without_anchor(texto):
        return "crime_acidente_generico_sem_vinculo_municipal"
    if has_municipal_anchor(texto):
        return "ancora_prefeitura_prefeito_orgao"
    if has_local_service_anchor(texto):
        return "bairro_servico_publico"
    if has_risk_with_municipal_anchor(texto):
        return "risco_com_ancora_municipal"
    return "sem_ancora_politica_municipal"


def is_municipal_political_candidate(m: Mencao) -> bool:
    """
    Curadoria para temas/crises: evita que notícia viral, crime/acidente comum
    ou fato de outro município vire pauta política da Prefeitura de Belém.
    """
    return is_municipal_political_text(normalize_for_curation(mention_text(m)))


def curation_reason(m: Mencao) -> str:
    return curation_reason_text(normalize_for_curation(mention_text(m)))
