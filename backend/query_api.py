from __future__ import annotations

from typing import Any
from uuid import UUID

from flask import Blueprint, jsonify, request

from backend.ai import create_embeddings, generate_rag_reply
from backend.auth import AuthenticationError, require_authenticated_user
from backend.supabase_client import SupabaseError


query_blueprint = Blueprint("query", __name__)


def validate_query_payload(payload: Any) -> tuple[str, str | None]:
    if not isinstance(payload, dict):
        raise ValueError("Invalid payload")

    message = payload.get("message")
    if not isinstance(message, str):
        raise ValueError("Invalid payload")

    normalized_message = message.strip()
    if not normalized_message or len(normalized_message) > 5000:
        raise ValueError("Invalid payload")

    thread_id = payload.get("threadId")
    if thread_id is None:
        return normalized_message, None

    if not isinstance(thread_id, str):
        raise ValueError("Invalid payload")

    try:
        UUID(thread_id)
    except ValueError as exc:
        raise ValueError("Invalid payload") from exc

    return normalized_message, thread_id


def retrieve_context(*, user_id: str, query: str, supabase) -> list[str]:
    query_embedding = create_embeddings([query])[0]
    matches = supabase.rpc(
        "match_file_chunks",
        {
            "query_embedding": query_embedding,
            "match_user_id": user_id,
            "match_count": 6,
        },
    )

    if not matches:
        return ["No uploaded document context found."]

    context: list[str] = []
    for match in matches:
        source_name = match.get("file_title") or match.get("file_name")
        details = [
            f"chunk {int(match.get('chunk_index', 0)) + 1}",
            f"page {match['page_number']}" if isinstance(match.get("page_number"), int) else None,
            (
                f"label {match['chunk_metadata']['pageLabel']}"
                if isinstance((match.get("chunk_metadata") or {}).get("pageLabel"), str)
                and (match.get("chunk_metadata") or {}).get("pageLabel")
                else None
            ),
            (
                f"rows {(match.get('chunk_metadata') or {}).get('rowStart')}-"
                f"{(match.get('chunk_metadata') or {}).get('rowEnd')}"
                if isinstance((match.get("chunk_metadata") or {}).get("rowStart"), int)
                and isinstance((match.get("chunk_metadata") or {}).get("rowEnd"), int)
                else None
            ),
            (
                "columns "
                + ", ".join((match.get("file_metadata") or {}).get("columnNames", [])[:6])
                if isinstance((match.get("file_metadata") or {}).get("columnNames"), list)
                and (match.get("file_metadata") or {}).get("columnNames")
                else None
            ),
            f"score {float(match.get('similarity', 0)):.3f}",
        ]
        rendered_details = ", ".join(value for value in details if value)
        context.append(f"Source: {source_name} ({rendered_details}): {match.get('content', '')}")

    return context


@query_blueprint.post("/query")
def query_documents():
    try:
        supabase, user = require_authenticated_user()
        message, thread_id = validate_query_payload(request.get_json(silent=True))

        if thread_id:
            existing_thread = supabase.get_single_row(
                "chat_threads",
                select="id",
                filters={"id": thread_id, "user_id": user["id"]},
            )
            if existing_thread is None:
                return jsonify({"error": "Thread not found"}), 404
        else:
            created_thread = supabase.insert_single_row(
                "chat_threads",
                {
                    "user_id": user["id"],
                    "title": message[:60],
                },
            )
            thread_id = created_thread["id"]

        user_message = supabase.insert_single_row(
            "chat_messages",
            {
                "thread_id": thread_id,
                "user_id": user["id"],
                "role": "user",
                "content": message,
            },
        )

        context = retrieve_context(user_id=user["id"], query=message, supabase=supabase)
        assistant_text = generate_rag_reply(question=message, context=context)

        assistant_message = supabase.insert_single_row(
            "chat_messages",
            {
                "thread_id": thread_id,
                "user_id": user["id"],
                "role": "assistant",
                "content": assistant_text,
            },
        )

        return jsonify(
            {
                "threadId": thread_id,
                "userMessage": {
                    "id": user_message["id"],
                    "role": user_message["role"],
                    "content": user_message["content"],
                    "created_at": user_message["created_at"],
                },
                "assistantMessage": {
                    "id": assistant_message["id"],
                    "role": assistant_message["role"],
                    "content": assistant_message["content"],
                    "created_at": assistant_message["created_at"],
                },
            }
        )
    except AuthenticationError:
        return jsonify({"error": "Unauthorized"}), 401
    except ValueError:
        return jsonify({"error": "Invalid payload"}), 400
    except SupabaseError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # pragma: no cover - safety net
        return jsonify({"error": str(exc) or "Failed to generate response"}), 500
