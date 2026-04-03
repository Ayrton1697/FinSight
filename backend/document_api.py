from __future__ import annotations

from uuid import UUID

from flask import Blueprint, jsonify

from backend.auth import AuthenticationError, require_authenticated_user
from backend.supabase import SupabaseError


document_blueprint = Blueprint("documents", __name__)


@document_blueprint.get("/get")
def list_documents():
    try:
        supabase, user = require_authenticated_user()
        documents = supabase.select_rows(
            "files",
            select="id,name,size,mime_type,created_at",
            filters={"user_id": user["id"]},
            order="created_at.desc",
        )
        return jsonify({"documents": documents})
    except AuthenticationError:
        return jsonify({"error": "Unauthorized"}), 401
    except SupabaseError as exc:
        return jsonify({"error": str(exc)}), 500


@document_blueprint.get("/get/<document_id>")
def get_document(document_id: str):
    try:
        UUID(document_id)
    except ValueError:
        return jsonify({"error": "Document not found"}), 404

    try:
        supabase, user = require_authenticated_user()
        document = supabase.get_single_row(
            "files",
            select="id,name,storage_path,mime_type",
            filters={"id": document_id, "user_id": user["id"]},
        )
        if document is None:
            return jsonify({"error": "Document not found"}), 404

        return jsonify(
            {
                "fileName": document["name"],
                "mimeType": document.get("mime_type"),
                "downloadUrl": supabase.create_signed_storage_url(document["storage_path"]),
            }
        )
    except AuthenticationError:
        return jsonify({"error": "Unauthorized"}), 401
    except SupabaseError as exc:
        return jsonify({"error": str(exc)}), 500
