from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

import requests
from openai import OpenAI

from backend.config import get_config


CHAT_AI_LOG_PREFIX = "[flask][ai]"
_OPENAI_CLIENT: OpenAI | None = None


def get_openai_client() -> OpenAI:
    global _OPENAI_CLIENT

    config = get_config()
    if not config.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for OpenAI-powered operations")

    if _OPENAI_CLIENT is None:
        _OPENAI_CLIENT = OpenAI(api_key=config.openai_api_key)

    return _OPENAI_CLIENT


def get_ollama_url(path: str) -> str:
    return urljoin(f"{get_config().ollama_base_url.rstrip('/')}/", path.lstrip("/"))


def validate_embedding_count(texts: list[str], embeddings: list[list[float]]) -> list[list[float]]:
    config = get_config()
    if len(embeddings) != len(texts):
        raise RuntimeError("Embedding generation returned an unexpected number of vectors")

    for embedding in embeddings:
        if len(embedding) != config.rag_embedding_dimensions:
            raise RuntimeError(
                "Embedding vector dimension mismatch: "
                f"expected {config.rag_embedding_dimensions}, received {len(embedding)}"
            )

    return embeddings


def build_rag_system_prompt() -> str:
    return " ".join(
        [
            "You are a finance-focused retrieval-augmented assistant.",
            "Answer the user using the retrieved context when it is relevant.",
            "If the context is missing or insufficient, say so clearly instead of inventing facts.",
            "Cite the most relevant sources by file name when possible.",
            "Keep the response concise and practical.",
        ]
    )


def build_rag_user_prompt(question: str, context: list[str]) -> str:
    formatted_context = (
        "\n\n".join(f"[{index}] {item}" for index, item in enumerate(context, start=1))
        if context
        else "No uploaded document context found."
    )
    return "\n".join(["Question:", question, "", "Retrieved context:", formatted_context])


def sanitize_model_text(text: str) -> str:
    return re.sub(r"<think>[\s\S]*?</think>\s*", "", text, flags=re.IGNORECASE).strip()


def create_openai_embeddings(texts: list[str]) -> list[list[float]]:
    config = get_config()
    print(
        f"{CHAT_AI_LOG_PREFIX} requesting OpenAI embeddings",
        {"inputCount": len(texts), "model": config.openai_embedding_model},
    )
    response = get_openai_client().embeddings.create(
        model=config.openai_embedding_model,
        input=texts,
        dimensions=config.rag_embedding_dimensions,
    )
    embeddings = [item.embedding for item in sorted(response.data, key=lambda item: item.index)]
    return validate_embedding_count(texts, embeddings)


def create_ollama_embeddings(texts: list[str]) -> list[list[float]]:
    config = get_config()
    response = requests.post(
        get_ollama_url("/api/embed"),
        json={"model": config.ollama_embedding_model, "input": texts},
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(f"Ollama embedding request failed: {response.status_code} {response.reason}")

    payload = response.json()
    embeddings = payload.get("embeddings")
    if not isinstance(embeddings, list):
        embedding = payload.get("embedding")
        embeddings = [embedding] if isinstance(embedding, list) else None
    if not isinstance(embeddings, list):
        raise RuntimeError("Ollama embedding response did not include embeddings")

    return validate_embedding_count(texts, embeddings)


def generate_openai_reply(question: str, context: list[str]) -> str:
    config = get_config()
    response = get_openai_client().responses.create(
        model=config.openai_chat_model,
        input=[
            {
                "role": "system",
                "content": [{"type": "input_text", "text": build_rag_system_prompt()}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": build_rag_user_prompt(question, context)}],
            },
        ],
    )
    text = sanitize_model_text(response.output_text)
    if not text:
        raise RuntimeError("OpenAI chat response did not include assistant text")
    return text


def generate_ollama_reply(question: str, context: list[str]) -> str:
    config = get_config()
    response = requests.post(
        get_ollama_url("/api/chat"),
        json={
            "model": config.ollama_chat_model,
            "stream": False,
            "messages": [
                {"role": "system", "content": build_rag_system_prompt()},
                {"role": "user", "content": build_rag_user_prompt(question, context)},
            ],
            "options": {"temperature": 0.2},
        },
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(f"Ollama chat request failed: {response.status_code} {response.reason}")

    payload = response.json()
    text = ((payload.get("message") or {}).get("content") or "").strip()
    sanitized = sanitize_model_text(text)
    if not sanitized:
        raise RuntimeError("Ollama chat response did not include assistant text")
    return sanitized


def create_embeddings(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    if get_config().ai_provider == "ollama":
        return create_ollama_embeddings(texts)
    return create_openai_embeddings(texts)


def generate_rag_reply(*, question: str, context: list[str]) -> str:
    if get_config().ai_provider == "ollama":
        return generate_ollama_reply(question, context)
    return generate_openai_reply(question, context)


def extract_text_from_image(buffer: bytes, mime_type: str) -> str:
    import base64

    config = get_config()
    response = get_openai_client().responses.create(
        model=config.openai_vision_model,
        input=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "Extract all readable text from this image. Preserve the reading order "
                            "and meaningful line breaks. Return only the extracted text."
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_url": f"data:{mime_type};base64,{base64.b64encode(buffer).decode('utf-8')}",
                        "detail": "auto",
                    },
                ],
            }
        ],
    )
    text = (response.output_text or "").strip()
    if not text:
        raise RuntimeError("OpenAI image OCR did not return extracted text")
    return text
