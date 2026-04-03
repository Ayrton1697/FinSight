from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urljoin

import requests

from backend.config import Config


DEFAULT_TIMEOUT_SECONDS = 120


class SupabaseError(RuntimeError):
    """Raised when a Supabase request fails."""


@dataclass(slots=True)
class SupabaseClient:
    config: Config
    access_token: str

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        use_service_role: bool = False,
    ) -> requests.Response:
        api_key = (
            self.config.supabase_service_role_key
            if use_service_role and self.config.supabase_service_role_key
            else self.config.supabase_anon_key
        )
        auth_token = (
            self.config.supabase_service_role_key
            if use_service_role and self.config.supabase_service_role_key
            else self.access_token
        )
        request_headers = {
            "apikey": api_key,
            "Authorization": f"Bearer {auth_token}",
        }
        if headers:
            request_headers.update(headers)

        response = requests.request(
            method,
            f"{self.config.supabase_url}{path}",
            params=params,
            json=json,
            data=data,
            headers=request_headers,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        if response.ok:
            return response

        try:
            payload = response.json()
        except ValueError:
            payload = response.text.strip()

        if isinstance(payload, dict):
            message = (
                payload.get("message")
                or payload.get("error_description")
                or payload.get("error")
                or payload.get("msg")
                or str(payload)
            )
        else:
            message = payload or f"Supabase request failed with status {response.status_code}"

        raise SupabaseError(message)

    def get_user(self) -> dict[str, Any]:
        response = self._request("GET", "/auth/v1/user")
        return response.json()

    def select_rows(
        self,
        table: str,
        *,
        select: str,
        filters: dict[str, Any] | None = None,
        order: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"select": select}
        if filters:
            for key, value in filters.items():
                params[key] = f"eq.{value}"
        if order:
            params["order"] = order
        if limit is not None:
            params["limit"] = str(limit)

        response = self._request("GET", f"/rest/v1/{table}", params=params)
        payload = response.json()
        if not isinstance(payload, list):
            raise SupabaseError(f"Expected list response for {table} select")
        return payload

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
        response = self._request(
            "POST",
            f"/rest/v1/{table}",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
        )
        data = response.json()
        if not isinstance(data, list):
            raise SupabaseError(f"Expected list response for {table} insert")
        return data

    def insert_single_row(self, table: str, payload: dict[str, Any]) -> dict[str, Any]:
        rows = self.insert_rows(table, payload)
        if len(rows) != 1:
            raise SupabaseError(f"Expected one inserted row for {table}, received {len(rows)}")
        return rows[0]

    def delete_rows(self, table: str, *, filters: dict[str, Any]) -> None:
        params = {key: f"eq.{value}" for key, value in filters.items()}
        self._request("DELETE", f"/rest/v1/{table}", params=params, headers={"Prefer": "return=minimal"})

    def rpc(self, function_name: str, payload: dict[str, Any]) -> Any:
        response = self._request(
            "POST",
            f"/rest/v1/rpc/{function_name}",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        return response.json()

    def upload_storage_object(self, path: str, file_bytes: bytes, content_type: str) -> None:
        encoded_path = quote(path, safe="/")
        self._request(
            "POST",
            f"/storage/v1/object/{self.config.storage_bucket}/{encoded_path}",
            data=file_bytes,
            headers={
                "Content-Type": content_type or "application/octet-stream",
                "x-upsert": "false",
            },
        )

    def delete_storage_object(self, path: str) -> None:
        encoded_path = quote(path, safe="/")
        self._request(
            "DELETE",
            f"/storage/v1/object/{self.config.storage_bucket}/{encoded_path}",
            headers={"Prefer": "return=minimal"},
        )

    def create_signed_storage_url(self, path: str, *, expires_in: int = 60) -> str:
        if not self.config.supabase_service_role_key:
            raise SupabaseError("SUPABASE_SERVICE_ROLE_KEY is required for document downloads")

        encoded_path = quote(path, safe="/")
        response = self._request(
            "POST",
            f"/storage/v1/object/sign/{self.config.storage_bucket}/{encoded_path}",
            json={"expiresIn": expires_in},
            headers={"Content-Type": "application/json"},
            use_service_role=True,
        )
        payload = response.json()
        signed_path = payload.get("signedURL") or payload.get("signedUrl")
        if not signed_path:
            raise SupabaseError("Supabase did not return a signed download URL")
        return urljoin(f"{self.config.supabase_url}/storage/v1/", signed_path.lstrip("/"))
