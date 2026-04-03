from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CORS_ORIGINS = ("http://127.0.0.1:3000", "http://localhost:3000")
AI_PROVIDERS = ("openai", "ollama")


for env_file in (REPO_ROOT / ".env.local", REPO_ROOT / ".env"):
    if env_file.exists():
        load_dotenv(env_file, override=False)


def require_non_empty(name: str, value: str | None) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise ValueError(f"Missing required environment variable: {name}")
    return normalized


def parse_enum_value(name: str, value: str | None, allowed_values: tuple[str, ...], fallback: str) -> str:
    normalized = (value or "").strip().lower()
    if not normalized:
        return fallback
    if normalized in allowed_values:
        return normalized
    joined = ", ".join(allowed_values)
    raise ValueError(f'Invalid {name}: expected one of {joined}, received "{value}"')


def parse_positive_integer(name: str, value: str | None, fallback: int) -> int:
    normalized = (value or "").strip()
    if not normalized:
        return fallback

    parsed = int(normalized)
    if parsed <= 0:
        raise ValueError(f'Invalid {name}: expected a positive integer, received "{value}"')
    return parsed


def parse_csv_list(value: str | None, fallback: tuple[str, ...]) -> tuple[str, ...]:
    normalized = [item.strip() for item in (value or "").split(",") if item.strip()]
    if not normalized:
        return fallback
    return tuple(normalized)


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    storage_bucket: str
    ai_provider: str
    rag_embedding_dimensions: int
    openai_api_key: str
    openai_embedding_model: str
    openai_chat_model: str
    openai_vision_model: str
    ollama_base_url: str
    ollama_embedding_model: str
    ollama_chat_model: str
    backend_port: int
    backend_cors_origins: tuple[str, ...]


@lru_cache(maxsize=1)
def get_config() -> Config:
    return Config(
        supabase_url=require_non_empty("NEXT_PUBLIC_SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL")),
        supabase_anon_key=require_non_empty(
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
            os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        ),
        supabase_service_role_key=(os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip(),
        storage_bucket=(os.getenv("SUPABASE_STORAGE_BUCKET") or "user-files").strip() or "user-files",
        ai_provider=parse_enum_value("AI_PROVIDER", os.getenv("AI_PROVIDER"), AI_PROVIDERS, "openai"),
        rag_embedding_dimensions=parse_positive_integer(
            "RAG_EMBEDDING_DIMENSIONS",
            os.getenv("RAG_EMBEDDING_DIMENSIONS"),
            1024,
        ),
        openai_api_key=(os.getenv("OPENAI_API_KEY") or "").strip(),
        openai_embedding_model=(os.getenv("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small").strip()
        or "text-embedding-3-small",
        openai_chat_model=(os.getenv("OPENAI_CHAT_MODEL") or "gpt-4.1-mini").strip() or "gpt-4.1-mini",
        openai_vision_model=(os.getenv("OPENAI_VISION_MODEL") or "gpt-4.1-mini").strip() or "gpt-4.1-mini",
        ollama_base_url=(os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").strip()
        or "http://127.0.0.1:11434",
        ollama_embedding_model=(os.getenv("OLLAMA_EMBEDDING_MODEL") or "bge-m3").strip() or "bge-m3",
        ollama_chat_model=(os.getenv("OLLAMA_CHAT_MODEL") or "qwen3:8b").strip() or "qwen3:8b",
        backend_port=parse_positive_integer("BACKEND_PORT", os.getenv("BACKEND_PORT"), 5000),
        backend_cors_origins=parse_csv_list(os.getenv("BACKEND_CORS_ORIGINS"), DEFAULT_CORS_ORIGINS),
    )
