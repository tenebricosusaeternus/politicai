"""
Roteamento central das chamadas LLM.

Mantém a regra de negócio fora dos detalhes de modelo e permite usar modelos
diferentes para triagem rápida, raciocínio e geração de relatório.
"""
from __future__ import annotations

from enum import Enum
from typing import Any

import httpx

from app.core.config import settings


class LLMTask(str, Enum):
    FAST_CLASSIFICATION = "fast_classification"
    THEME_EXTRACTION = "theme_extraction"
    REASONING = "reasoning"
    REPORT = "report"


def model_for_task(task: LLMTask | str) -> str:
    task_value = task.value if isinstance(task, LLMTask) else str(task)
    fallback = settings.LLM_MODEL

    if task_value == LLMTask.FAST_CLASSIFICATION:
        return settings.LLM_MODEL_FAST or fallback
    if task_value == LLMTask.THEME_EXTRACTION:
        return settings.LLM_MODEL_FAST or fallback
    if task_value == LLMTask.REASONING:
        return settings.LLM_MODEL_REASONING or settings.LLM_MODEL_REPORT or fallback
    if task_value == LLMTask.REPORT:
        return settings.LLM_MODEL_REPORT or settings.LLM_MODEL_REASONING or fallback

    return fallback


def _supports_thinking_tags(model: str) -> bool:
    return settings.LLM_ENABLE_THINKING_TAGS and "qwen3" in model.lower()


def _with_thinking_control(messages: list[dict[str, str]], *, model: str, thinking: bool) -> list[dict[str, str]]:
    if not _supports_thinking_tags(model):
        return messages

    tag = "/think" if thinking else "/no_think"
    controlled = [dict(m) for m in messages]
    for msg in reversed(controlled):
        if msg.get("role") == "user":
            msg["content"] = f"{tag}\n{msg.get('content', '')}"
            return controlled

    controlled.append({"role": "user", "content": tag})
    return controlled


def chat_completion(
    *,
    task: LLMTask | str,
    messages: list[dict[str, str]],
    max_tokens: int,
    temperature: float = 0,
    thinking: bool = False,
    timeout: float = 180,
    extra_payload: dict[str, Any] | None = None,
) -> str:
    model = model_for_task(task)
    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": _with_thinking_control(messages, model=model, thinking=thinking),
    }
    if extra_payload:
        payload.update(extra_payload)

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(f"{settings.LLM_BASE_URL}/chat/completions", json=payload)
        resp.raise_for_status()
        message = resp.json()["choices"][0]["message"]
        content = (message.get("content") or "").strip()
        if content:
            return content
        if message.get("reasoning"):
            raise ValueError("LLM retornou apenas reasoning; aumente max_tokens ou desative thinking para esta tarefa.")
        raise ValueError("LLM retornou resposta sem content.")


def configured_models() -> dict[str, str]:
    return {
        "default": settings.LLM_MODEL,
        "fast_classification": model_for_task(LLMTask.FAST_CLASSIFICATION),
        "theme_extraction": model_for_task(LLMTask.THEME_EXTRACTION),
        "reasoning": model_for_task(LLMTask.REASONING),
        "report": model_for_task(LLMTask.REPORT),
    }
