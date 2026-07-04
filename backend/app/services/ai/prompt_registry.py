from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.services.ai.llm_router import configured_models

BASE_DIR = Path(__file__).resolve().parent
PROMPTS_DIR = BASE_DIR / "prompts"
SCHEMAS_DIR = BASE_DIR / "schemas"
EVALS_DIR = BASE_DIR / "evals"
INSTANCES_FILE = BASE_DIR / "instances.json"


@lru_cache(maxsize=1)
def load_instances() -> dict[str, dict[str, Any]]:
    with INSTANCES_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _prompt_file(version: str) -> Path:
    return PROMPTS_DIR / f"{version}.md"


def _schema_file(version: str) -> Path:
    return SCHEMAS_DIR / f"{version}.schema.json"


def list_prompt_files() -> list[dict[str, Any]]:
    prompts = []
    for path in sorted(PROMPTS_DIR.glob("*.md")):
        prompts.append({
            "version": path.stem,
            "filename": path.name,
            "size": path.stat().st_size,
        })
    return prompts


def list_schema_files() -> list[dict[str, Any]]:
    schemas = []
    for path in sorted(SCHEMAS_DIR.glob("*.schema.json")):
        schemas.append({
            "version": path.name.removesuffix(".schema.json"),
            "filename": path.name,
            "size": path.stat().st_size,
        })
    return schemas


def get_prompt(version: str) -> str:
    path = _prompt_file(version)
    if not path.exists():
        raise FileNotFoundError(version)
    return _read_text(path)


def get_schema(version: str) -> Any:
    path = _schema_file(version)
    if not path.exists():
        raise FileNotFoundError(version)
    return _read_json(path)


def load_golden_dataset(limit: int | None = None) -> list[dict[str, Any]]:
    path = EVALS_DIR / "golden_mentions_v1.jsonl"
    items: list[dict[str, Any]] = []
    if not path.exists():
        return items
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        items.append(json.loads(line))
        if limit and len(items) >= limit:
            break
    return items


def registry_overview() -> dict[str, Any]:
    instances = load_instances()
    models = configured_models()
    return {
        "models": models,
        "instances": [
            {
                "id": instance_id,
                **config,
                "active_model": models.get(config.get("model_alias", ""), models.get(config.get("task", ""), "")),
            }
            for instance_id, config in instances.items()
        ],
        "prompts": list_prompt_files(),
        "schemas": list_schema_files(),
        "golden_dataset": {
            "name": "golden_mentions_v1",
            "count": len(load_golden_dataset()),
        },
    }


def build_compact_classification_prompt(items: list[dict[str, str]]) -> str:
    lines = []
    for item in items:
        item_id = str(item["id"]).strip()
        text = str(item["texto"]).replace("\n", " ").strip()
        lines.append(f"{item_id}: {text}")
    return "\n".join(lines)
