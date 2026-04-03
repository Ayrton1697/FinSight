from __future__ import annotations

from flask import Blueprint, jsonify, request

from backend.auth import AuthenticationError, require_authenticated_user
from backend.supabase_client import SupabaseError
from backend.uploads import build_storage_path, get_allowed_upload_kind, process_upload_for_indexing


upload_blueprint = Blueprint("upload", __name__)


def upload_error_status(message: str) -> int:
    client_errors = (
        "No file received",
        "Only PDF, CSV, and image files are allowed",
        "No text could be extracted from the uploaded file",
        "No indexable text chunks were generated",
        "Unsupported file type",
    )
    return 400 if any(fragment in message for fragment in client_errors) else 500


@upload_blueprint.post("/upload")
def upload_document():
    uploaded_to_storage = False
    file_id: str | None = None
    storage_path: str | None = None
    bucket_client = None

    try:
        bucket_client, user = require_authenticated_user()
        uploaded_file = request.files.get("file")
        if uploaded_file is None or not uploaded_file.filename:
            return jsonify({"error": "No file received"}), 400

        file_name = uploaded_file.filename
        mime_type = uploaded_file.mimetype or "application/octet-stream"
        if not get_allowed_upload_kind(file_name, mime_type):
            return jsonify({"error": "Only PDF, CSV, and image files are allowed"}), 400

        file_bytes = uploaded_file.read()
        if not file_bytes:
            return jsonify({"error": "No file received"}), 400

        storage_path = build_storage_path(user["id"], file_name)
        indexed_upload = process_upload_for_indexing(file_bytes, file_name, mime_type)

        bucket_client.upload_storage_object(storage_path, file_bytes, mime_type)
        uploaded_to_storage = True

        inserted_file = bucket_client.insert_single_row(
            "files",
            {
                "user_id": user["id"],
                "name": file_name,
                "title": indexed_upload.title,
                "storage_path": storage_path,
                "size": len(file_bytes),
                "mime_type": mime_type,
                "metadata": indexed_upload.file_metadata,
            },
        )
        file_id = inserted_file["id"]

        bucket_client.insert_rows(
            "file_chunks",
            [
                {
                    "file_id": file_id,
                    "user_id": user["id"],
                    "chunk_index": index,
                    "content": chunk.content,
                    "metadata": chunk.metadata,
                    "page_number": (
                        chunk.metadata.get("pageNumber")
                        if isinstance(chunk.metadata.get("pageNumber"), int)
                        else None
                    ),
                    "embedding": indexed_upload.embeddings[index],
                }
                for index, chunk in enumerate(indexed_upload.chunks)
            ],
        )

        return jsonify({"success": True, "chunkCount": len(indexed_upload.chunks)})
    except AuthenticationError:
        return jsonify({"error": "Unauthorized"}), 401
    except Exception as exc:
        if bucket_client is not None and file_id:
            try:
                bucket_client.delete_rows("files", filters={"id": file_id})
            except SupabaseError:
                pass
        if bucket_client is not None and uploaded_to_storage and storage_path:
            try:
                bucket_client.delete_storage_object(storage_path)
            except SupabaseError:
                pass

        message = str(exc) or "Failed to process file"
        return jsonify({"error": message}), upload_error_status(message)
