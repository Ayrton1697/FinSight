from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from typing import Any
from urllib.parse import urljoin

from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

from backend.config import Config


class SupabaseError(RuntimeError):
    """Raised when a Supabase request fails."""


@dataclass(slots=True)
class SupabaseClient:
    config: Config
    access_token: str
    _user_client: Client | None = field(default=None, init=False, repr=False)
    _service_role_client: Client | None = field(default=None, init=False, repr=False)

    def _client(self, *, use_service_role: bool = False) -> Client:
        if use_service_role:
            if self._service_role_client is None:
                if not self.config.supabase_service_role_key:
                    raise SupabaseError("SUPABASE_SERVICE_ROLE_KEY is required for document downloads")
                self._service_role_client = create_client(
                    self.config.supabase_url,
                    self.config.supabase_service_role_key,
                    options=ClientOptions(auto_refresh_token=False, persist_session=False),
                )
            return self._service_role_client

        if self._user_client is None:
            self._user_client = create_client(
                self.config.supabase_url,
                self.config.supabase_anon_key,
                options=ClientOptions(
                    auto_refresh_token=False,
                    persist_session=False,
                    headers={"Authorization": f"Bearer {self.access_token}"},
                ),
            )
        return self._user_client

    def _raise_as_supabase_error(self, exc: Exception) -> SupabaseError:
        message = getattr(exc, "message", None)
        if isinstance(message, str) and message.strip():
            return SupabaseError(message)
        if exc.args:
            return SupabaseError(str(exc.args[0]))
        return SupabaseError(str(exc) or "Supabase request failed")

    def _model_to_dict(self, value: Any) -> dict[str, Any]:
        if hasattr(value, "model_dump"):
            payload = value.model_dump()
        elif hasattr(value, "dict"):
            payload = value.dict()
        else:
            payload = value

        if not isinstance(payload, dict):
            raise SupabaseError("Expected a Supabase object payload")
        return payload

    def _apply_filters(self, query: Any, filters: dict[str, Any] | None) -> Any:
        if not filters:
            return query
        for key, value in filters.items():
            query = query.eq(key, value)
        return query

    def _apply_order(self, query: Any, order: str | None) -> Any:
        if not order:
            return query

        for clause in [part.strip() for part in order.split(",") if part.strip()]:
            column, direction = clause, "asc"
            if "." in clause:
                candidate_column, candidate_direction = clause.rsplit(".", 1)
                if candidate_direction in {"asc", "desc"}:
                    column, direction = candidate_column, candidate_direction
            query = query.order(column, desc=direction == "desc")
        return query

    def get_user(self) -> dict[str, Any]:
        try:
            response = self._client().auth.get_user(self.access_token)
            return self._model_to_dict(response.user)
        except Exception as exc:  # pragma: no cover - SDK errors vary by layer
            raise self._raise_as_supabase_error(exc) from exc

    def select_rows(
        self,
        table: str,
        *,
        select: str,
        filters: dict[str, Any] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        try:
            query = self._client().table(table).select(select)
            query = self._apply_filters(query, filters)
            query = self._apply_order(query, order)
            if limit is not None:
                query = query.limit(limit)

            payload = query.execute().data
            if not isinstance(payload, list):
                raise SupabaseError(f"Expected list response for {table} select")
            return payload
        except Exception as exc:  # pragma: no cover - SDK errors vary by layer
            raise self._raise_as_supabase_error(exc) from exc

    def get_single_row(
        self,
        table: str,
        *,
        select: str,
        filters: dict[str, Any] | None = None,
        order: str | None = None,
    ) -> dict[str, Any] | None:
        rows = self.select_rows(table, select=select, filters=filters, order=order, limit=2)
        if not rows:
            return None
        if len(rows) > 1:
            raise SupabaseError(f"Expected a single row from {table}, received {len(rows)}")
        return rows[0]

    def insert_rows(self, table: str, payload: list[dict[str, Any]] | dict[str, Any]) -> list[dict[str, Any]]:
        try:
            data = self._client().table(table).insert(payload).execute().data
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                return [data]
            raise SupabaseError(f"Expected list response for {table} insert")
        except Exception as exc:  # pragma: no cover - SDK errors vary by layer
            raise self._raise_as_supabase_error(exc) from exc

    def insert_single_row(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        rows = self.insert_rows(table, payload)
        if len(rows) != 1:
            raise SupabaseError(f"Expected one inserted row for {table}, received {len(rows)}")
        return rows[0]

    def delete_rows(self, table: str, *, filters: dict[str, Any]) -> None:
        try:
            query = self._apply_filters(self._client().table(table).delete(), filters)
            query.execute()
        except Exception as exc:  # pragma: no cover - SDK errors vary by layer
            raise self._raise_as_supabase_error(exc) from exc

    def rpc(self, function_name: str, payload: dict[str, Any]) -> Any:
        try:
            return self._client().rpc(function_name, payload).execute().data
        except Exception as exc:  # pragma: no cover - SDK errors vary by layer
            raise self._raise_as_supabase_error(exc) from exc

    def upload_storage_object(self, path: str, file_bytes: bytes, content_type: str) -> None:
        try:
            self._client().storage.from_(self.config.storage_bucket).upload(
                path=path,
                file=BytesIO(file_bytes),
                file_options={
                    "content-type": content_type or "application/octet-stream",
                    "upsert": "false",
                },
            )
        except Exception as exc:  # pragma: no cover - SDK errors vary by layer
            raise self._raise_as_supabase_error(exc) from exc

    def delete_storage_object(self, path: str) -> None:
        try:
            self._client().storage.from_(self.config.storage_bucket).remove([path])
        except Exception as exc:  # pragma: no cover - SDK errors vary by layer
            raise self._raise_as_supabase_error(exc) from exc

    def create_signed_storage_url(self, path: str, *, expires_in: int = 60) -> str:
        try:
            payload = self._client(use_service_role=True).storage.from_(self.config.storage_bucket).create_signed_url(
                path,
                expires_in,
            )
            if isinstance(payload, str):
                return payload

            signed_path = None
            if isinstance(payload, dict):
                signed_path = (
                    payload.get("signedURL")
                    or payload.get("signedUrl")
                    or payload.get("signed_url")
                    or payload.get("url")
                )
            if not signed_path:
                raise SupabaseError("Supabase did not return a signed download URL")
            return urljoin(f"{self.config.supabase_url}/storage/v1/", str(signed_path).lstrip("/"))
        except Exception as exc:  # pragma: no cover - SDK errors vary by layer
            raise self._raise_as_supabase_error(exc) from exc
