from __future__ import annotations

from typing import Any

from flask import request

from backend.config import get_config
from backend.supabase import SupabaseClient


class AuthenticationError(RuntimeError):
    """Raised when a request is missing a valid Supabase access token."""


def get_request_access_token() -> str:
    authorization = request.headers.get("Authorization", "").strip()
    if not authorization:
        raise AuthenticationError("Missing Authorization header")

    prefix = "bearer "
    if authorization.lower().startswith(prefix):
        token = authorization[len(prefix) :].strip()
    else:
        token = authorization

    if not token:
        raise AuthenticationError("Missing bearer token")

    return token


def require_authenticated_user() -> tuple[SupabaseClient, dict[str, Any]]:
    access_token = get_request_access_token()
    supabase = SupabaseClient(get_config(), access_token)
    user = supabase.get_user()
    if not user or not user.get("id"):
        raise AuthenticationError("Unauthorized")
    return supabase, user
