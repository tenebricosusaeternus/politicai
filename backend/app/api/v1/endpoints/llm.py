from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.ai.llm_router import LLMTask, chat_completion, configured_models
from app.services.ai.prompt_registry import (
    build_compact_classification_prompt,
    get_prompt,
    get_schema,
    load_golden_dataset,
    load_instances,
    registry_overview,
)

router = APIRouter(prefix="/llm", tags=["llm"])

VALID_CLASSES = {"POSITIVA", "NEGATIVA", "NEUTRA", "IRRELEVANTE"}
LINE_RE = re.compile(r"^\s*(?P<id>[^:]+)\s*:\s*(?P<class>POSITIVA|NEGATIVA|NEUTRA|IRRELEVANTE)\s*$")


class TestItem(BaseModel):
    id: str
    texto: str


class ClassificationTestRequest(BaseModel):
    items: list[TestItem] = Field(default_factory=list, max_length=30)
    use_golden_sample: bool = False


def _parse_compact(output: str, expected_ids: set[str]) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        match = LINE_RE.match(line)
        if not match:
            raise ValueError(f"Linha invalida: {line}")
        item_id = match.group("id").strip()
        klass = match.group("class").strip()
        if klass not in VALID_CLASSES:
            raise ValueError(f"Classe invalida: {klass}")
        if item_id in parsed:
            raise ValueError(f"ID duplicado: {item_id}")
        parsed[item_id] = klass

    missing = expected_ids - set(parsed)
    extra = set(parsed) - expected_ids
    if missing:
        raise ValueError(f"IDs ausentes: {sorted(missing)}")
    if extra:
        raise ValueError(f"IDs extras: {sorted(extra)}")
    return parsed


@router.get("/registry")
def llm_registry() -> dict[str, Any]:
    return registry_overview()


@router.get("/models")
def llm_models() -> dict[str, Any]:
    return configured_models()


@router.get("/instances/{instance_id}")
def llm_instance(instance_id: str) -> dict[str, Any]:
    instances = load_instances()
    config = instances.get(instance_id)
    if not config:
        raise HTTPException(status_code=404, detail="Instancia nao encontrada")

    prompt_version = config.get("prompt_version")
    schema_version = config.get("schema_version")
    return {
        "id": instance_id,
        "config": config,
        "prompt": get_prompt(prompt_version) if prompt_version else None,
        "schema": get_schema(schema_version) if schema_version else None,
    }


@router.get("/prompts/{version}")
def llm_prompt(version: str) -> dict[str, Any]:
    try:
        return {"version": version, "content": get_prompt(version)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Prompt nao encontrado")


@router.get("/schemas/{version}")
def llm_schema(version: str) -> dict[str, Any]:
    try:
        return {"version": version, "schema": get_schema(version)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Schema nao encontrado")


@router.get("/golden")
def llm_golden(limit: int = 50) -> dict[str, Any]:
    return {"name": "golden_mentions_v1", "items": load_golden_dataset(limit=limit)}


@router.post("/test/classification")
def test_classification(payload: ClassificationTestRequest) -> dict[str, Any]:
    items = [item.dict() for item in payload.items]
    if payload.use_golden_sample or not items:
        items = [
            {"id": item["id"], "texto": item["texto"], "classe_esperada": item.get("classe_esperada")}
            for item in load_golden_dataset(limit=12)
        ]

    if not items:
        raise HTTPException(status_code=400, detail="Nenhum item para testar")

    system_prompt = get_prompt("fast_relevance_sentiment_classifier_v1.0.0")
    llm_items = [
        {"id": str(idx), "texto": item["texto"], "original_id": str(item["id"])}
        for idx, item in enumerate(items, 1)
    ]
    user_prompt = build_compact_classification_prompt(llm_items)
    expected_ids = {item["id"] for item in llm_items}

    try:
        output = chat_completion(
            task=LLMTask.FAST_CLASSIFICATION,
            max_tokens=max(256, len(items) * 16),
            temperature=0,
            thinking=False,
            timeout=180,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        parsed = _parse_compact(output, expected_ids)
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "items": items,
            "raw_output": locals().get("output", ""),
        }

    results = []
    acertos = 0
    avaliaveis = 0
    for idx, item in enumerate(items, 1):
        esperado = item.get("classe_esperada")
        llm_id = str(idx)
        previsto = parsed.get(llm_id)
        if esperado:
            avaliaveis += 1
            if esperado == previsto:
                acertos += 1
        results.append({
            "id": item["id"],
            "llm_id": llm_id,
            "texto": item["texto"],
            "classe_esperada": esperado,
            "classe_prevista": previsto,
            "ok": esperado == previsto if esperado else None,
        })

    return {
        "ok": True,
        "model": configured_models()["fast_classification"],
        "prompt_version": "fast_relevance_sentiment_classifier_v1.0.0",
        "raw_output": output,
        "accuracy": round(acertos / avaliaveis, 4) if avaliaveis else None,
        "results": results,
    }
